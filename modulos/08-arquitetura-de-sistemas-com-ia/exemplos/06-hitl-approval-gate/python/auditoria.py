"""Audit Trail append-only no Postgres, com encadeamento de hash (cada linha guarda o hash da anterior).

Um trigger impede UPDATE/DELETE; e se alguém burlar o trigger (ex.: superusuário), a cadeia quebra e a
verificação acusa. É o princípio de um ledger/blockchain, sem a parte distribuída. Tabela m08.auditoria_py.
"""

import hashlib
import json

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def criar_auditoria(conn: psycopg.Connection) -> None:
    # Sem parâmetros, o psycopg não interpreta "%": o % do RAISE vai literal (e vários comandos num execute).
    conn.execute("""
        DROP TABLE IF EXISTS m08.auditoria_py;
        CREATE TABLE m08.auditoria_py (
          seq bigserial PRIMARY KEY, em timestamptz NOT NULL DEFAULT now(),
          ator text NOT NULL, evento text NOT NULL, acao_id text NOT NULL, dados jsonb NOT NULL,
          hash_anterior text NOT NULL, hash text NOT NULL);
        CREATE OR REPLACE FUNCTION m08.auditoria_py_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'auditoria é append-only (% bloqueado)', TG_OP; END $$;
        CREATE TRIGGER auditoria_py_imutavel BEFORE UPDATE OR DELETE ON m08.auditoria_py
          FOR EACH ROW EXECUTE FUNCTION m08.auditoria_py_imutavel();""")


def calcular_hash(anterior: str, ator: str, evento: str, acao_id: str, dados: dict) -> str:
    # JSON canônico (chaves ordenadas, sem espaços): o jsonb do Postgres REORDENA as chaves ao gravar, então o
    # dict lido de volta pode serializar diferente do original e o hash não bateria. Mesmo formato do
    # JSON.stringify(canonico(...)) do JS: as duas versões produzem o MESMO hash para os mesmos eventos.
    canonico = json.dumps([anterior, ator, evento, acao_id, dados], sort_keys=True, separators=(",", ":"),
                          ensure_ascii=False)
    return hashlib.sha256(canonico.encode()).hexdigest()


def registrar(conn: psycopg.Connection, *, ator: str, evento: str, acao_id: str, dados: dict) -> None:
    with conn.transaction():
        # Lock da tabela serializa os escritores: sem isso, dois eventos simultâneos usariam o mesmo "anterior".
        conn.execute("LOCK TABLE m08.auditoria_py IN EXCLUSIVE MODE")
        linha = conn.execute("SELECT hash FROM m08.auditoria_py ORDER BY seq DESC LIMIT 1").fetchone()
        anterior = linha[0] if linha else "genesis"
        conn.execute(
            "INSERT INTO m08.auditoria_py (ator, evento, acao_id, dados, hash_anterior, hash) VALUES (%s,%s,%s,%s,%s,%s)",
            (ator, evento, acao_id, Jsonb(dados), anterior, calcular_hash(anterior, ator, evento, acao_id, dados)),
        )


def verificar_cadeia(conn: psycopg.Connection) -> int | None:
    """Recalcula a cadeia inteira; devolve a primeira seq adulterada ou None."""
    anterior = "genesis"
    with conn.cursor(row_factory=dict_row) as cur:
        for r in cur.execute("SELECT * FROM m08.auditoria_py ORDER BY seq"):
            if r["hash_anterior"] != anterior or calcular_hash(anterior, r["ator"], r["evento"], r["acao_id"], r["dados"]) != r["hash"]:
                return r["seq"]
            anterior = r["hash"]
    return None
