// Banco do Micro-SaaS: Postgres + pgvector no schema m11. Uma tabela de chunks para TODOS os clientes,
// separados por tenant_id (multi-tenant "pool"): simples de operar; o isolamento é garantido por
// TODA consulta filtrar por tenant_id (testado em test/integracao.test.js).
import pg from 'pg';
import { config } from './config.js';

export const DIM = 1024; // qwen3-embedding:0.6b gera vetores de 1024 posições

export function criarPool(databaseUrl = config.databaseUrl) {
  return new pg.Pool({ connectionString: databaseUrl, max: 5 });
}

/** Migração idempotente (CREATE ... IF NOT EXISTS): roda no boot da API, do CLI e do seed. */
export async function migrar(pool) {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS m11;
    CREATE TABLE IF NOT EXISTS m11.tenants (
      id            text PRIMARY KEY,
      nome          text NOT NULL,
      api_key_hash  text NOT NULL UNIQUE,      -- só o hash: vazou o banco, não vazou a chave
      plano         text NOT NULL DEFAULT 'free',
      cota_diaria   int  NOT NULL DEFAULT 50   -- perguntas ao LLM por dia (exercício 01)
    );
    CREATE TABLE IF NOT EXISTS m11.chunks (
      id         bigserial PRIMARY KEY,
      tenant_id  text NOT NULL REFERENCES m11.tenants(id) ON DELETE CASCADE,
      fonte      text NOT NULL,                -- arquivo de origem: é o que vira citação
      titulo     text NOT NULL,
      conteudo   text NOT NULL,
      emb        vector(${DIM}) NOT NULL,
      -- full-text gerado pelo próprio Postgres: a busca híbrida (módulo 08) usa vetor + palavra exata
      tsv        tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', conteudo)) STORED
    );
    CREATE INDEX IF NOT EXISTS chunks_tenant ON m11.chunks (tenant_id);
    CREATE INDEX IF NOT EXISTS chunks_emb_hnsw ON m11.chunks USING hnsw (emb vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS chunks_tsv ON m11.chunks USING gin (tsv);
    CREATE TABLE IF NOT EXISTS m11.cache (
      id         bigserial PRIMARY KEY,
      tenant_id  text NOT NULL REFERENCES m11.tenants(id) ON DELETE CASCADE,
      versao     text NOT NULL,                -- versão do prompt: mudou o prompt, o cache antigo não vale
      pergunta   text NOT NULL,
      emb        vector(${DIM}) NOT NULL,
      resposta   jsonb NOT NULL,
      criado_em  timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS m11.auditoria (
      id         bigserial PRIMARY KEY,
      ts         timestamptz NOT NULL DEFAULT now(),
      tenant_id  text NOT NULL,
      canal      text NOT NULL,                -- cli | rest | mcp | adk
      acao       text NOT NULL,                -- buscar | perguntar | indexar ...
      detalhe    jsonb NOT NULL DEFAULT '{}'   -- SEM PII: a pergunta entra já mascarada
    );
  `);
}
