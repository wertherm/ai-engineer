"""Acesso ao Postgres (schema m03) + seed idempotente do mini-CRM/billing fictício (versão Python).

Mesmo schema do JS (m03), mas tabelas com sufixo _py: o JS faz DROP/CREATE de m03.clientes/m03.faturas a
cada execução, e as duas versões rodando juntas apagariam os dados uma da outra.
"""

import os

import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")


def conectar() -> psycopg.Connection:
    # search_path no schema do módulo: nunca escrevemos no public. autocommit: cada tool é uma transação curta.
    return psycopg.connect(DATABASE_URL, options="-c search_path=m03", autocommit=True)


def resetar_banco(conn: psycopg.Connection) -> None:
    # Sem parâmetros, o psycopg aceita vários comandos num execute só.
    conn.execute("""
        CREATE SCHEMA IF NOT EXISTS m03;
        DROP TABLE IF EXISTS m03.faturas_py, m03.clientes_py;
        CREATE TABLE m03.clientes_py (
          id SERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          email TEXT NOT NULL,
          plano TEXT NOT NULL CHECK (plano IN ('basico', 'pro', 'enterprise'))
        );
        CREATE TABLE m03.faturas_py (
          id SERIAL PRIMARY KEY,
          cliente_id INT NOT NULL REFERENCES m03.clientes_py(id),
          valor NUMERIC(12,2) NOT NULL,
          vencimento DATE NOT NULL,
          status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga'))
        );
        INSERT INTO m03.clientes_py (nome, email, plano) VALUES
          ('Padaria Pão Quente', 'contato@paoquente.example', 'basico'),
          ('Oficina Turbo', 'financeiro@turbo.example', 'pro'),
          ('Clínica Sorriso', 'adm@sorriso.example', 'enterprise');
        INSERT INTO m03.faturas_py (cliente_id, valor, vencimento, status) VALUES
          (1, 199.90, '2026-09-10', 'paga'),
          (1, 199.90, '2026-10-10', 'aberta'),
          (1, 49.90,  '2026-10-20', 'aberta'),
          (2, 499.00, '2026-10-05', 'aberta'),
          (3, 1990.00, '2026-10-01', 'paga');
    """)


if __name__ == "__main__":
    with conectar() as conn:
        resetar_banco(conn)
        n = conn.execute("SELECT count(*) FROM faturas_py").fetchone()[0]
        print(f"Schema m03 recriado: 3 clientes, {n} faturas (tabelas *_py).")
