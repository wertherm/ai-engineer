"""Peças de um RAG mínimo com Postgres + pgvector (psycopg 3). Usado pelo exemplo 05 e pelo exercício 02.

Mesmo schema do JS (`m01`), mas tabela própria `m01.chunks_py`: as duas versões podem rodar ao mesmo
tempo sem uma apagar a coleção da outra.
"""

import re
from pathlib import Path

import numpy as np
import psycopg
from pgvector.psycopg import register_vector

from .llm import DATABASE_URL, embed

DIM = 1024  # qwen3-embedding:0.6b gera vetores de 1024 posições


def conectar() -> psycopg.Connection:
    db = psycopg.connect(DATABASE_URL, autocommit=True)
    # Cada módulo do repo usa o PRÓPRIO schema; nunca o public.
    db.execute("CREATE SCHEMA IF NOT EXISTS m01")
    db.execute(f"""
        CREATE TABLE IF NOT EXISTS m01.chunks_py (
          id        bigserial PRIMARY KEY,
          colecao   text NOT NULL,   -- permite guardar estratégias de chunking diferentes lado a lado
          fonte     text NOT NULL,   -- arquivo de origem (para citar na resposta)
          conteudo  text NOT NULL,
          embedding vector({DIM}) NOT NULL
        )""")
    # HNSW: índice aproximado (ANN) para distância de cosseno.
    db.execute(
        "CREATE INDEX IF NOT EXISTS chunks_py_embedding_hnsw ON m01.chunks_py USING hnsw (embedding vector_cosine_ops)"
    )
    # Só depois de a extensão existir: ensina o psycopg a converter `vector` <-> numpy.ndarray.
    register_vector(db)
    return db


def ler_corpus(pasta: Path) -> list[dict]:
    """Lê os .md de uma pasta -> [{fonte, titulo, texto}]."""
    docs = []
    for arq in sorted(pasta.glob("*.md")):
        texto = arq.read_text(encoding="utf-8")
        titulo = re.sub(r"^#\s*", "", texto.split("\n")[0])
        docs.append({"fonte": arq.name, "titulo": titulo, "texto": texto})
    return docs


def chunk_por_paragrafo(doc: dict) -> list[dict]:
    """Chunking por parágrafo, cada pedaço prefixado com o título do documento.

    Sem o título, um parágrafo como "O limite é de R$ 90 por dia" perde o contexto ("limite de quê?").
    """
    paragrafos = re.split(r"\n\s*\n", doc["texto"])[1:]  # descarta a linha do título (vai como prefixo)
    return [
        {"fonte": doc["fonte"], "conteudo": f"{doc['titulo']}: {p.strip()}"} for p in paragrafos if p.strip()
    ]


def indexar(db: psycopg.Connection, colecao: str, chunks: list[dict]) -> int:
    db.execute("DELETE FROM m01.chunks_py WHERE colecao = %s", (colecao,))  # idempotente: reindexa do zero
    vetores = embed([c["conteudo"] for c in chunks])  # 1 chamada em lote
    with db.cursor() as cur:
        cur.executemany(
            "INSERT INTO m01.chunks_py (colecao, fonte, conteudo, embedding) VALUES (%s, %s, %s, %s)",
            [(colecao, c["fonte"], c["conteudo"], np.array(v)) for c, v in zip(chunks, vetores)],
        )
    return len(chunks)


def buscar(db: psycopg.Connection, colecao: str, pergunta: str, k: int = 3) -> list[dict]:
    """Busca semântica: `<=>` é a distância de cosseno do pgvector (0 = mesma direção)."""
    v = np.array(embed([pergunta])[0])
    linhas = db.execute(
        """SELECT fonte, conteudo, 1 - (embedding <=> %(v)s) AS similaridade
             FROM m01.chunks_py WHERE colecao = %(c)s
            ORDER BY embedding <=> %(v)s LIMIT %(k)s""",
        {"v": v, "c": colecao, "k": k},
    ).fetchall()
    return [{"fonte": f, "conteudo": c, "similaridade": float(s)} for f, c, s in linhas]
