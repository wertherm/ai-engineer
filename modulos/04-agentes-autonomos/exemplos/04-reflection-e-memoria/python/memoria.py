"""Memory store de longo prazo no pgvector (schema m04, tabela memorias_py). Cada memória tem um TIPO:
  - longa:     fatos/preferências estáveis do usuário ("prefiro respostas em tópicos")
  - episodica: o que aconteceu numa execução e a lição aprendida (reflexão)
Recuperação por similaridade de embeddings (distância de cosseno, operador <=>)."""

import numpy as np
import psycopg
from psycopg.rows import dict_row

from comum_py.llm import embed


def preparar_tabela(conn: psycopg.Connection, *, zerar: bool = False) -> None:
    if zerar:
        conn.execute("DROP TABLE IF EXISTS m04.memorias_py")
    conn.execute("""CREATE TABLE IF NOT EXISTS m04.memorias_py (
      id serial PRIMARY KEY,
      tipo text NOT NULL CHECK (tipo IN ('longa', 'episodica')),
      conteudo text NOT NULL,
      embedding vector(1024) NOT NULL,
      criada_em timestamptz NOT NULL DEFAULT now())""")


def lembrar(conn: psycopg.Connection, tipo: str, conteudo: str) -> None:
    (e,) = embed([conteudo])
    # register_vector (em comum_py.conectar) ensina o psycopg a mandar np.ndarray como vector.
    conn.execute("INSERT INTO m04.memorias_py (tipo, conteudo, embedding) VALUES (%s, %s, %s)", (tipo, conteudo, np.array(e)))


def recuperar(conn: psycopg.Connection, consulta: str, *, k: int = 3, distancia_max: float = 0.6) -> list[dict]:
    """Top-k memórias mais parecidas com a consulta, com limiar de distância (evita "lembrar" lixo)."""
    (e,) = embed([consulta])
    with conn.cursor(row_factory=dict_row) as cur:
        linhas = cur.execute(
            "SELECT tipo, conteudo, round((embedding <=> %(v)s)::numeric, 3) AS distancia "
            "FROM m04.memorias_py ORDER BY embedding <=> %(v)s LIMIT %(k)s", {"v": np.array(e), "k": k}).fetchall()
    return [l for l in linhas if float(l["distancia"]) <= distancia_max]
