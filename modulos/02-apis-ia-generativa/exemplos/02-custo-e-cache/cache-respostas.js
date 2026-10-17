// Cache de respostas no Postgres (schema m02): mesma requisição → mesma resposta, custo zero.
// A chave é o hash de TUDO que muda a resposta (modelo + parâmetros + mensagens).
// Só faz sentido com saída determinística (temperature 0 / seed) ou quando "qualquer resposta
// válida" serve; e precisa de TTL, senão você serve resposta velha para sempre.
import { createHash } from "node:crypto";
import pg from "pg";
import { DATABASE_URL, SCHEMA } from "../../comum/config.js";

export async function abrirCache() {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.cache_respostas (
    chave text PRIMARY KEY,
    resposta jsonb NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now()
  )`);
  return db;
}

export function chaveDe(requisicao) {
  return createHash("sha256").update(JSON.stringify(requisicao)).digest("hex");
}

// Envolve qualquer chamada: devolve { resposta, hit }.
export async function comCache(db, requisicao, chamar, ttlHoras = 24) {
  const chave = chaveDe(requisicao);
  const { rows } = await db.query(
    `SELECT resposta FROM ${SCHEMA}.cache_respostas
      WHERE chave = $1 AND criado_em > now() - make_interval(hours => $2)`,
    [chave, ttlHoras],
  );
  if (rows.length) return { resposta: rows[0].resposta, hit: true };
  const resposta = await chamar(requisicao);
  await db.query(
    `INSERT INTO ${SCHEMA}.cache_respostas (chave, resposta) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET resposta = EXCLUDED.resposta, criado_em = now()`,
    [chave, resposta],
  );
  return { resposta, hit: false };
}
