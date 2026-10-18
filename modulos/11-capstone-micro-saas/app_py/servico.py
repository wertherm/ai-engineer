"""Fachada do Micro-SaaS (versão Python de app/src/servico.js): a ÚNICA camada de regra de negócio.
CLI, API REST, servidor MCP e agentes ADK chamam estes métodos; nenhum deles fala com o banco ou com o
LLM diretamente. Assim o comportamento (isolamento por tenant, PII, cache, auditoria) é igual em todos os canais."""

import json
import time
from collections.abc import Callable

from pgvector import Vector
from psycopg.types.json import Jsonb

from .agente import executar_agente
from .pii import mascarar
from .rag import FALLBACK, buscar_hibrida, indexar_documento, montar_mensagens, para_consulta, verificar_resposta

VERSAO_PROMPT = "v1"
LIMIAR_CACHE = 0.95  # cosseno mínimo para tratar como "a mesma pergunta" (módulo 08)
# Se nem o MELHOR trecho passa deste cosseno, o assunto não está nas políticas: responde o fallback
# sem gastar LLM (medido no corpus: perguntas fora do tema ficam em ~0,33-0,41; dentro, acima de 0,55).
LIMIAR_RELEVANCIA = 0.5


def _ms(t0: float) -> int:
    return round((time.perf_counter() - t0) * 1000)


class Servico:
    def __init__(self, pool, llm, log: Callable[[str], None] = lambda _m: None):
        self.pool, self.llm, self.log = pool, llm, log

    async def _auditar(self, tenant: dict, canal: str, acao: str, detalhe: dict) -> None:
        async with self.pool.connection() as conn:
            await conn.execute("INSERT INTO m11.auditoria_py (tenant_id, canal, acao, detalhe) VALUES (%s, %s, %s, %s)",
                               [tenant["id"], canal, acao, Jsonb(detalhe)])

    async def _embed_consulta(self, texto: str) -> list[float]:
        [v] = await self.llm.embed([para_consulta(texto)])
        return v

    async def listar_documentos(self, tenant: dict) -> list[dict]:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                "SELECT fonte, min(titulo) AS titulo, count(*)::int AS chunks FROM m11.chunks_py"
                " WHERE tenant_id = %s GROUP BY fonte ORDER BY fonte",
                [tenant["id"]],
            )
            return await cur.fetchall()

    async def indexar(self, tenant: dict, doc: dict, *, canal: str = "rest") -> dict:
        chunks = await indexar_documento(self.pool, self.llm, tenant["id"], {"fonte": doc["fonte"], "texto": doc["texto"]})
        async with self.pool.connection() as conn:  # política mudou: cache do tenant inválido
            await conn.execute("DELETE FROM m11.cache_py WHERE tenant_id = %s", [tenant["id"]])
        await self._auditar(tenant, canal, "indexar", {"fonte": doc["fonte"], "chunks": chunks})
        return {"fonte": doc["fonte"], "chunks": chunks}

    async def remover(self, tenant: dict, fonte: str, *, canal: str = "rest") -> dict:
        async with self.pool.connection() as conn:
            cur = await conn.execute("DELETE FROM m11.chunks_py WHERE tenant_id = %s AND fonte = %s", [tenant["id"], fonte])
            removidos = cur.rowcount
            # Respostas em cache podem citar o documento removido. Só invalida se algo saiu de fato: um DELETE
            # de arquivo inexistente (404) não pode custar ao cliente o cache inteiro.
            if removidos:
                await conn.execute("DELETE FROM m11.cache_py WHERE tenant_id = %s", [tenant["id"]])
        await self._auditar(tenant, canal, "remover", {"fonte": fonte, "chunks": removidos})
        return {"fonte": fonte, "removidos": removidos}

    async def buscar(self, tenant: dict, consulta: str, *, k: int = 4, canal: str = "rest", emb=None) -> list[dict]:
        """Só recuperação (sem LLM de chat): rápido, determinístico, bom para tools MCP e para avaliação."""
        texto = mascarar(consulta)["texto"]  # PII nunca vai para o provedor de embeddings
        vetor = emb if emb is not None else await self._embed_consulta(texto)
        trechos = await buscar_hibrida(self.pool, tenant["id"], texto, vetor, k)
        await self._auditar(tenant, canal, "buscar", {"consulta": texto, "fontes": [t["fonte"] for t in trechos]})
        return trechos

    async def perguntar(self, tenant: dict, pergunta: str, *, modo: str = "rag", canal: str = "rest", k: int = 4) -> dict:
        """Pergunta respondida pelo RAG (modo "rag") ou pelo agente com RAG como ferramenta (modo "agente")."""
        t0 = time.perf_counter()
        m = mascarar(pergunta)
        pergunta_segura, contagem = m["texto"], m["contagem"]
        if contagem:
            self.log(f"[pii] mascarado antes do LLM: {json.dumps(contagem, separators=(',', ':'))}")

        if modo == "agente":
            r = await executar_agente(servico=self, llm=self.llm, tenant=tenant, pergunta=pergunta_segura, log=self.log)
            saida = {
                "resposta": r["resposta"] or FALLBACK,
                "modo": modo,
                "citacoes": [{"fonte": f} for f in r["fontes"]],
                "verificado": r["verificado"],
                "passos": r["passos"],
                "cache": False,
                "ms": _ms(t0),
            }
            await self._auditar(tenant, canal, "perguntar",
                                {"pergunta": pergunta_segura, "modo": modo, "ms": saida["ms"], "fontes": r["fontes"]})
            return saida

        # 1) Um embedding por pergunta, reaproveitado no cache e na busca.
        emb = await self._embed_consulta(pergunta_segura)

        # 2) Cache semântico POR TENANT (a mesma pergunta em outra empresa tem outra resposta!).
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                """SELECT resposta, 1 - (emb <=> %(emb)s) AS sim FROM m11.cache_py
                    WHERE tenant_id = %(t)s AND versao = %(v)s AND criado_em > now() - interval '1 day'
                    ORDER BY emb <=> %(emb)s LIMIT 1""",
                {"emb": Vector(emb), "t": tenant["id"], "v": VERSAO_PROMPT},
            )
            viz = await cur.fetchone()
        if viz and viz["sim"] >= LIMIAR_CACHE:
            saida = {**viz["resposta"], "cache": True, "ms": _ms(t0)}
            await self._auditar(tenant, canal, "perguntar", {"pergunta": pergunta_segura, "cache": True, "ms": saida["ms"]})
            return saida

        # 3) Recuperação híbrida dentro do tenant + corte por relevância.
        trechos = await self.buscar(tenant, pergunta_segura, k=k, canal=canal, emb=emb)
        if not trechos or max(t["sim"] for t in trechos) < LIMIAR_RELEVANCIA:
            return {"resposta": FALLBACK, "modo": modo, "citacoes": [], "verificado": True, "cache": False,
                    "ms": _ms(t0), "tokens": 0}

        # 4) Geração com fontes numeradas + 5) verificação das citações (falha fechado).
        r = await self.llm.chat(montar_mensagens(tenant["nome"], pergunta_segura, trechos), max_tokens=140)
        conteudo = r["msg"].content
        verif = verificar_resposta(conteudo, len(trechos))
        saida = {
            "resposta": conteudo.strip() if verif["ok"] else FALLBACK,
            "modo": modo,
            "citacoes": [{"n": n, "fonte": trechos[n - 1]["fonte"], "trecho": trechos[n - 1]["conteudo"]} for n in verif["citacoes"]]
            if verif["ok"] else [],
            "verificado": verif["ok"],
            "cache": False,
            "tokens": (r["usage"].get("prompt_tokens") or 0) + (r["usage"].get("completion_tokens") or 0),
            "ms": _ms(t0),
        }
        if not verif["ok"]:
            saida["motivoBloqueio"] = verif["motivo"]
        if verif["ok"]:
            async with self.pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO m11.cache_py (tenant_id, versao, pergunta, emb, resposta) VALUES (%s, %s, %s, %s, %s)",
                    [tenant["id"], VERSAO_PROMPT, pergunta_segura, Vector(emb), Jsonb(saida)],
                )
        await self._auditar(tenant, canal, "perguntar", {
            "pergunta": pergunta_segura, "modo": modo, "ms": saida["ms"], "tokens": saida["tokens"],
            "verificado": verif["ok"], "motivo": verif["motivo"],
        })
        return saida


def criar_servico(*, pool, llm, log: Callable[[str], None] = lambda _m: None) -> Servico:
    return Servico(pool, llm, log)
