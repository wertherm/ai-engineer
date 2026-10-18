"""Solução do exercício 02 (Python) · Agentic RAG: o MODELO decide se precisa buscar, o que buscar e quando parar.

Reaproveita o corpus e a busca híbrida da versão Python do exemplo 04 (tabela m08.rag_docs_py).
"""

import json
import re
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[4]  # pasta do módulo
sys.path.insert(0, str(RAIZ / "exemplos" / "04-padroes-de-rag" / "python"))
from buscas import busca_hibrida  # noqa: E402
from corpus import com_instrucao, indexar  # noqa: E402

from comum_py.llm import arredondar, chat, conectar, embed  # noqa: E402

TOOLS = [{
    "type": "function",
    "function": {
        "name": "buscar_documentos",
        "description": "Busca nas políticas internas e nos produtos financeiros da empresa (CCB, TAC, antecipação, "
                       "home office, senhas...). Use só para fatos da empresa.",
        "parameters": {"type": "object", "properties": {"consulta": {"type": "string", "description": "termos de busca"}},
                       "required": ["consulta"]},
    },
}]

SISTEMA = ("Você é o assistente da empresa. Para fatos sobre a empresa, chame buscar_documentos. "
           "Para conhecimento geral ou conta, responda direto, sem ferramenta. Responda em 1 frase e cite [id] "
           "quando usar documento.")

# Guardrail determinístico: na 1ª versão (JS) o modelo respondeu "CCB-78" SEM buscar e inventou o prazo. Código
# de produto/política (LETRAS-NÚMEROS) é sinal forte de fato interno: a busca é obrigatória e não fica a critério
# do LLM (decision framework do doc 01: regra onde a regra é confiável). re.ASCII: \b igual ao do JS.
CODIGO = re.compile(r"\b[A-Z]{2,}(-[A-Z]+)?-\d+\b", re.ASCII)
CITACAO = re.compile(r"\[(\w+)\]")


def main() -> None:
    conn = conectar()
    indexar(conn)

    def buscar(consulta: str) -> str:
        ids = busca_hibrida(conn, consulta, embed([com_instrucao(consulta)])[0], 2)
        linhas = conn.execute("SELECT id, texto FROM m08.rag_docs_py WHERE id = ANY(%s)", (ids,)).fetchall()
        return "\n".join(f"[{i}] {t}" for i, t in linhas)

    def agente(pergunta: str, max_passos: int = 3) -> dict:
        msgs = [{"role": "system", "content": SISTEMA}, {"role": "user", "content": pergunta}]
        trilha: list[str] = []
        recuperados: set[str] = set()
        tokens = 0
        if CODIGO.search(pergunta):
            ctx = buscar(pergunta)
            recuperados.update(CITACAO.findall(ctx))
            trilha.append(f'busca forçada pela regra ("{pergunta}")')
            msgs.append({"role": "user", "content": f"Documentos recuperados:\n{ctx}"})
        for passo in range(max_passos):
            # No último passo não oferecemos tools: força a resposta final (guarda contra loop de buscas).
            r = chat(msgs, tools=TOOLS if passo < max_passos - 1 else None, max_tokens=70)
            tokens += r["usage"].total_tokens if r["usage"] else 0
            chamadas = r["msg"].tool_calls or []
            if not chamadas:
                # Checagem de citação: todo [id] citado tem de ter sido recuperado; senão é fonte inventada.
                fonte_ok = all(i in recuperados for i in CITACAO.findall(r["texto"]))
                return {"resposta": r["texto"], "trilha": trilha, "tokens": tokens, "fonte_ok": fonte_ok}
            msgs.append(r["msg"].model_dump(exclude_none=True))
            for c in chamadas:
                consulta = json.loads(c.function.arguments)["consulta"]
                trilha.append(f'buscar("{consulta}")')
                ctx = buscar(consulta)
                recuperados.update(CITACAO.findall(ctx))
                msgs.append({"role": "tool", "tool_call_id": c.id, "content": ctx})
        return {"resposta": f"(sem resposta em {max_passos} passos)", "trilha": trilha, "tokens": tokens, "fonte_ok": False}

    for p in ["Quanto é 12 vezes 8?", "Qual o prazo da CCB-78?", "Posso trabalhar de casa quantos dias?"]:
        t0 = time.perf_counter()
        r = agente(p)
        print(f"\nP: {p}")
        print(f"   decisão: {' -> '.join(r['trilha']) if r['trilha'] else 'respondeu sem buscar'}")
        print(f"   R: {r['resposta']}")
        print(f"   citações válidas? {'sim' if r['fonte_ok'] else 'NÃO (fonte inventada)'}")
        print(f"   {r['tokens']} tokens · {arredondar(time.perf_counter() - t0)} s", flush=True)
    conn.close()


main()
