"""Busca semântica com pgvector no schema m05, tabela faq_py (a do JS é m05.faq)."""

import threading
from decimal import ROUND_HALF_UP, Decimal

import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector

from comum_py.config import DATABASE_URL, MODELO_EMBED, SCHEMA
from faq import FAQ

TABELA = f"{SCHEMA}.faq_py"


class Busca:
    """Uma conexão (autocommit: sem transação implícita do psycopg 3) protegida por lock: as rotas do
    FastAPI rodam em threads do threadpool."""

    def __init__(self, cliente):
        self.cliente = cliente
        self.conn = psycopg.connect(DATABASE_URL, autocommit=True)
        register_vector(self.conn)  # dumper/loader de pgvector.Vector (sem precisar de numpy)
        self.lock = threading.Lock()

    def embedding(self, texto: str) -> Vector:
        r = self.cliente.embeddings.create(model=MODELO_EMBED, input=texto)
        return Vector(r.data[0].embedding)

    def indexar(self) -> int:
        """Idempotente: recria o conteúdo só se o número de linhas não bater com o FAQ."""
        with self.lock:
            self.conn.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
            self.conn.execute(f"CREATE TABLE IF NOT EXISTS {TABELA} (id serial PRIMARY KEY, categoria text, "
                              "pergunta text, resposta text, embedding vector(1024))")
            if self.conn.execute(f"SELECT count(*) FROM {TABELA}").fetchone()[0] == len(FAQ):
                return 0
            self.conn.execute(f"TRUNCATE {TABELA}")
            for f in FAQ:
                v = self.embedding(f"{f['pergunta']}\n{f['resposta']}")
                self.conn.execute(f"INSERT INTO {TABELA} (categoria, pergunta, resposta, embedding) VALUES (%s,%s,%s,%s)",
                                  (f["categoria"], f["pergunta"], f["resposta"], v))
            return len(FAQ)

    def buscar(self, q: str, k: int = 3, interesses: list[str] | None = None) -> list[dict]:
        """Personalização em tempo real: categorias de interesse dão +0,05 no score (peso pequeno de
        propósito: personalizar não pode esconder a resposta certa)."""
        interesses = interesses or []
        v = self.embedding(q)
        with self.lock:
            linhas = self.conn.execute(
                f"SELECT categoria, pergunta, resposta, 1 - (embedding <=> %s) FROM {TABELA} "
                "ORDER BY embedding <=> %s LIMIT 8", (v, v)).fetchall()
        itens = [{"categoria": c, "pergunta": p, "resposta": r, "score": float(s) + (0.05 if c in interesses else 0)}
                 for c, p, r, s in linhas]
        itens.sort(key=lambda x: x["score"], reverse=True)
        # toFixed(3) do JS = arredondamento "meio para cima" sobre o valor exato do float.
        for it in itens:
            it["score"] = float(Decimal(it["score"]).quantize(Decimal("0.001"), ROUND_HALF_UP))
        return itens[:k]
