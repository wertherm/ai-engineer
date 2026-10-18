"""As estratégias de recuperação, todas com a MESMA assinatura: (conn, pergunta, emb, k) -> ids.

Com 14 documentos não precisamos de índice HNSW (busca exata é instantânea); em produção, crie um.
"""

import math

import psycopg

from comum_py.llm import vetor


def busca_vetorial(conn: psycopg.Connection, _q: str, emb: list[float], k: int, indice: str | None = None) -> list[str]:
    """RAG Basic: só similaridade de cosseno (<=> é distância de cosseno no pgvector)."""
    linhas = conn.execute(
        """SELECT id FROM m08.rag_docs_py WHERE (%(ind)s::text IS NULL OR indice = %(ind)s)
           ORDER BY emb <=> %(emb)s LIMIT %(k)s""",
        {"emb": vetor(emb), "k": k, "ind": indice},
    ).fetchall()
    return [l[0] for l in linhas]


def busca_hibrida(conn: psycopg.Connection, q: str, emb: list[float], k: int, indice: str | None = None) -> list[str]:
    """Hybrid Search: vetorial + full-text (tsvector) fundidos por RRF (Reciprocal Rank Fusion).

    score(d) = soma de 1 / (60 + posição de d em cada lista). RRF usa só a POSIÇÃO: não precisa normalizar
    escalas diferentes (cosseno × ts_rank). A consulta full-text vira um OR dos lexemas da pergunta
    (websearch_to_tsquery faria AND, restritivo demais). SQL idêntico ao do JS, com parâmetros nomeados.
    """
    linhas = conn.execute(
        """WITH consulta AS (
             SELECT to_tsquery('portuguese', array_to_string(tsvector_to_array(to_tsvector('portuguese', %(q)s)), ' | ')) AS tq),
           vet AS (
             SELECT id, row_number() OVER (ORDER BY emb <=> %(emb)s) AS pos
             FROM m08.rag_docs_py WHERE (%(ind)s::text IS NULL OR indice = %(ind)s) ORDER BY emb <=> %(emb)s LIMIT 20),
           txt AS (
             SELECT id, row_number() OVER (ORDER BY ts_rank_cd(tsv, tq) DESC) AS pos
             FROM m08.rag_docs_py, consulta WHERE tsv @@ tq AND (%(ind)s::text IS NULL OR indice = %(ind)s)
             ORDER BY ts_rank_cd(tsv, tq) DESC LIMIT 20)
           SELECT id, sum(1.0 / (60 + pos)) AS rrf FROM (
             SELECT id, pos, 'vet' AS fonte FROM vet UNION ALL SELECT id, pos, 'txt' FROM txt) u
           -- Desempate explícito: em RRF, "1º num ranking + 2º no outro" EMPATA com "2º + 1º".
           -- Preferimos o melhor no full-text (termo exato), senão a ordem dependeria do acaso.
           GROUP BY id ORDER BY rrf DESC, min(pos) FILTER (WHERE fonte = 'txt') NULLS LAST LIMIT %(k)s""",
        {"emb": vetor(emb), "q": q, "k": k, "ind": indice},
    ).fetchall()
    return [l[0] for l in linhas]


def busca_multi_indice_federada(conn: psycopg.Connection, q: str, emb: list[float], k: int) -> list[str]:
    """Multi-Index federado (fan-out): busca em CADA índice e funde as listas por RRF.
    Não depende de acertar o índice; custa uma consulta por índice."""
    rrf: dict[str, float] = {}
    for ind in ("politicas", "produtos"):
        for pos, id_ in enumerate(busca_hibrida(conn, q, emb, k, ind)):
            rrf[id_] = rrf.get(id_, 0) + 1 / (60 + pos + 1)
    # Empate entre os primeiros de cada índice: desempata pela busca híbrida global (relevância real).
    glob = busca_hibrida(conn, q, emb, 2 * k)
    pos_global = {id_: i for i, id_ in enumerate(glob)}
    return sorted(rrf, key=lambda i: (-rrf[i], pos_global.get(i, -1)))[:k]


def cosseno(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b)) / (math.hypot(*a) * math.hypot(*b))


def criar_busca_multi_indice(emb_indices: dict[str, list[float]]):
    """Multi-Index roteado: ROTEIA a pergunta para o índice mais parecido (pela descrição do índice) e faz a
    busca híbrida só dentro dele. Ganha precisão quando índices têm vocabulário parecido, mas o roteador vira
    ponto único de falha."""

    def buscar(conn, q, emb, k):
        indice = max(emb_indices, key=lambda n: cosseno(emb, emb_indices[n]))
        return busca_hibrida(conn, q, emb, k, indice)

    return buscar
