"""Semantic Cache no pgvector: reaproveita a resposta de uma pergunta PARECIDA (não só idêntica)."""

import psycopg
from psycopg.rows import dict_row

from comum_py.llm import embed, vetor


def para_cache(q: str) -> str:
    # Instrução de "perguntas equivalentes" (não de "trechos que respondem"): queremos paráfrases, não temas.
    return f"Instruct: Given a question, retrieve semantically equivalent questions\nQuery: {q}"


class CacheSemantico:
    def __init__(self, conn: psycopg.Connection, *, limiar: float = 0.9, versao_prompt: str = "v1"):
        """limiar = similaridade de cosseno mínima para considerar "a mesma pergunta"."""
        self.conn, self.limiar, self.versao_prompt = conn, limiar, versao_prompt

    def iniciar(self, *, limpar: bool = True) -> None:
        self.conn.execute("""CREATE TABLE IF NOT EXISTS m08.cache_semantico_py (
            id bigserial PRIMARY KEY, versao_prompt text NOT NULL, pergunta text NOT NULL, emb vector(1024) NOT NULL,
            resposta text NOT NULL, tier text NOT NULL, prompt_tokens int, completion_tokens int,
            criado_em timestamptz NOT NULL DEFAULT now())""")
        if limpar:
            self.conn.execute("TRUNCATE m08.cache_semantico_py")

    def buscar(self, pergunta: str) -> dict:
        """Devolve {hit, sim, vizinho, emb}. O emb volta para o gravar (1 embedding por pedido)."""
        emb = vetor(embed([para_cache(pergunta)])[0])
        # A versão do prompt entra na chave: mudou o prompt do sistema, as respostas antigas não valem mais.
        # O TTL (1 dia) evita servir resposta velha sobre dado que muda (taxa, cotação...).
        with self.conn.cursor(row_factory=dict_row) as cur:
            viz = cur.execute(
                """SELECT pergunta, resposta, tier, prompt_tokens, completion_tokens, 1 - (emb <=> %(e)s) AS sim
                   FROM m08.cache_semantico_py WHERE versao_prompt = %(v)s AND criado_em > now() - interval '1 day'
                   ORDER BY emb <=> %(e)s LIMIT 1""",
                {"e": emb, "v": self.versao_prompt},
            ).fetchone()
        sim = viz["sim"] if viz else 0.0
        return {"hit": bool(viz) and sim >= self.limiar, "sim": sim, "vizinho": viz, "emb": emb}

    def gravar(self, pergunta: str, emb, resposta: str, tier: str, usage) -> None:
        self.conn.execute(
            """INSERT INTO m08.cache_semantico_py (versao_prompt, pergunta, emb, resposta, tier, prompt_tokens, completion_tokens)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (self.versao_prompt, pergunta, emb, resposta, tier,
             usage.prompt_tokens if usage else 0, usage.completion_tokens if usage else 0),
        )
