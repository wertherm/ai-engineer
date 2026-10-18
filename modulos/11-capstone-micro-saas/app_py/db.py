"""Banco do Micro-SaaS: Postgres + pgvector no schema m11, tabelas com sufixo _py (as do JS ficam
intactas). Uma tabela de chunks para TODOS os clientes, separados por tenant_id (multi-tenant "pool"):
o isolamento é garantido por TODA consulta filtrar por tenant_id (testado em tests/test_integracao.py)."""

from pgvector.psycopg import register_vector_async
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from . import config

DIM = 1024  # qwen3-embedding:0.6b gera vetores de 1024 posições


async def _configurar(conn: AsyncConnection) -> None:
    # Ensina o psycopg a mandar/receber o tipo vector (pgvector.Vector <-> vector do Postgres).
    await register_vector_async(conn)


def novo_pool(database_url: str = config.DATABASE_URL, max_size: int = 5) -> AsyncConnectionPool:
    """Pool assíncrono ainda FECHADO (abre com `await pool.open()`, já dentro do event loop; a API abre no lifespan).
    autocommit=True: cada comando vale na hora (o psycopg 3 abriria transação implícita); onde precisa de
    atomicidade usamos `async with conn.transaction()` explicitamente."""
    return AsyncConnectionPool(database_url, min_size=1, max_size=max_size, open=False, configure=_configurar,
                               kwargs={"autocommit": True, "row_factory": dict_row})


async def criar_pool(database_url: str = config.DATABASE_URL, max_size: int = 5) -> AsyncConnectionPool:
    """Pool aberto e pronto (CLI, seed, testes)."""
    pool = novo_pool(database_url, max_size)
    await pool.open(wait=True)
    return pool


MIGRACAO = f"""
CREATE SCHEMA IF NOT EXISTS m11;
CREATE TABLE IF NOT EXISTS m11.tenants_py (
  id            text PRIMARY KEY,
  nome          text NOT NULL,
  api_key_hash  text NOT NULL UNIQUE,      -- só o hash: vazou o banco, não vazou a chave
  plano         text NOT NULL DEFAULT 'free',
  cota_diaria   int  NOT NULL DEFAULT 50   -- perguntas ao LLM por dia (exercício 01)
);
CREATE TABLE IF NOT EXISTS m11.chunks_py (
  id         bigserial PRIMARY KEY,
  tenant_id  text NOT NULL REFERENCES m11.tenants_py(id) ON DELETE CASCADE,
  fonte      text NOT NULL,                -- arquivo de origem: é o que vira citação
  titulo     text NOT NULL,
  conteudo   text NOT NULL,
  emb        vector({DIM}) NOT NULL,
  -- full-text gerado pelo próprio Postgres: a busca híbrida usa vetor + palavra exata
  tsv        tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', conteudo)) STORED
);
CREATE INDEX IF NOT EXISTS chunks_py_tenant ON m11.chunks_py (tenant_id);
CREATE INDEX IF NOT EXISTS chunks_py_emb_hnsw ON m11.chunks_py USING hnsw (emb vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_py_tsv ON m11.chunks_py USING gin (tsv);
CREATE TABLE IF NOT EXISTS m11.cache_py (
  id         bigserial PRIMARY KEY,
  tenant_id  text NOT NULL REFERENCES m11.tenants_py(id) ON DELETE CASCADE,
  versao     text NOT NULL,                -- versão do prompt: mudou o prompt, o cache antigo não vale
  pergunta   text NOT NULL,
  emb        vector({DIM}) NOT NULL,
  resposta   jsonb NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS m11.auditoria_py (
  id         bigserial PRIMARY KEY,
  ts         timestamptz NOT NULL DEFAULT now(),
  tenant_id  text NOT NULL,
  canal      text NOT NULL,                -- cli | rest | mcp | adk
  acao       text NOT NULL,                -- buscar | perguntar | indexar ...
  detalhe    jsonb NOT NULL DEFAULT '{{}}'  -- SEM PII: a pergunta entra já mascarada
);
"""


async def migrar(pool: AsyncConnectionPool) -> None:
    """Migração idempotente (CREATE ... IF NOT EXISTS): roda no boot da API, do CLI e do seed.
    Sem parâmetros, o psycopg aceita vários comandos num execute só."""
    async with pool.connection() as conn:
        await conn.execute(MIGRACAO)
