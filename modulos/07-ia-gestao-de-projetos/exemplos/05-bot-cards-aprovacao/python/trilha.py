"""Trilha de decisão no Postgres (schema m07), encadeada por hash: alterar uma linha antiga quebra a cadeia.

Tabela própria da versão Python (m07.trilha_bot_py) para não misturar com a cadeia do JS.
"""
import hashlib
import json
import os

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")
TABELA = "m07.trilha_bot_py"


def conectar() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL, autocommit=True)


def preparar_trilha(conn: psycopg.Connection) -> None:
    conn.execute("CREATE SCHEMA IF NOT EXISTS m07")
    conn.execute(f"""CREATE TABLE IF NOT EXISTS {TABELA} (
        id bigserial PRIMARY KEY,
        criado_em timestamptz NOT NULL DEFAULT now(),
        solicitante text NOT NULL,
        pedido text NOT NULL,
        operacao jsonb NOT NULL,
        status text NOT NULL,          -- executado | aguardando_aprovacao | aprovado_e_executado | erro
        motivo text,
        hash_anterior text NOT NULL,
        hash text NOT NULL
    )""")


def canonico(v) -> str:
    """JSON canônico (chaves ordenadas, sem espaços, acentos sem escape): igual ao canonico() do trilha.js.

    O jsonb do Postgres NÃO preserva a ordem das chaves do objeto gravado; sem ordenar, o hash recalculado
    na leitura pode divergir do gravado mesmo sem adulteração.
    """
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def hash_de(anterior: str, r: dict) -> str:
    dados = [r["solicitante"], r["pedido"], r["operacao"], r["status"], r.get("motivo")]
    return hashlib.sha256((anterior + canonico(dados)).encode("utf-8")).hexdigest()


def registrar(conn: psycopg.Connection, r: dict) -> None:
    linha = conn.execute(f"SELECT hash FROM {TABELA} ORDER BY id DESC LIMIT 1").fetchone()
    anterior = linha[0] if linha else "genesis"
    conn.execute(
        f"INSERT INTO {TABELA} (solicitante, pedido, operacao, status, motivo, hash_anterior, hash) VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (r["solicitante"], r["pedido"], Jsonb(r["operacao"]), r["status"], r.get("motivo"), anterior, hash_de(anterior, r)),
    )


def verificar_trilha(conn: psycopg.Connection) -> dict:
    """Auditoria: recalcula a cadeia inteira. Aponta o id da primeira linha adulterada."""
    with conn.cursor(row_factory=dict_row) as cur:
        linhas = cur.execute(f"SELECT * FROM {TABELA} ORDER BY id").fetchall()
    anterior = "genesis"
    for r in linhas:
        if r["hash_anterior"] != anterior or r["hash"] != hash_de(anterior, r):
            return {"ok": False, "linha": r["id"], "total": len(linhas)}
        anterior = r["hash"]
    return {"ok": True, "total": len(linhas)}
