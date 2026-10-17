// Busca semântica com pgvector no schema m05 (mesma técnica do RAG do módulo 01).
import pg from 'pg';
import pgvector from 'pgvector';
import { DATABASE_URL, MODELO_EMBED, SCHEMA } from '../../comum/config.js';
import { FAQ } from './faq.js';

// Sem pgvector.registerTypes(): só ENVIAMOS vetores (pgvector.toSql) e nunca lemos a coluna de volta.
// Registrar no evento 'connect' do Pool dispara a DeprecationWarning do pg 8.x "Calling client.query()
// when the client is already executing a query" (a consulta de tipos corre junto da 1ª query).
export function criarPool() {
  return new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
}

export async function embedding(cliente, texto) {
  const r = await cliente.embeddings.create({ model: MODELO_EMBED, input: texto });
  return r.data[0].embedding;
}

// Idempotente: recria a tabela só se o número de linhas não bater com o FAQ.
export async function indexar(pool, cliente) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.faq (id serial PRIMARY KEY, categoria text, pergunta text, resposta text, embedding vector(1024))`);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.faq`);
  if (rows[0].n === FAQ.length) return 0;
  await pool.query(`TRUNCATE ${SCHEMA}.faq`);
  for (const f of FAQ) {
    const v = await embedding(cliente, `${f.pergunta}\n${f.resposta}`);
    await pool.query(`INSERT INTO ${SCHEMA}.faq (categoria, pergunta, resposta, embedding) VALUES ($1,$2,$3,$4)`, [f.categoria, f.pergunta, f.resposta, pgvector.toSql(v)]);
  }
  return FAQ.length;
}

// Personalização em tempo real: categorias de interesse do usuário (vindas do clique nos resultados)
// dão um pequeno bônus no ranking. O peso é pequeno de propósito: personalizar não pode esconder
// a resposta certa.
export async function buscar(pool, cliente, q, { k = 3, interesses = [] } = {}) {
  const v = await embedding(cliente, q);
  const { rows } = await pool.query(
    `SELECT categoria, pergunta, resposta, 1 - (embedding <=> $1) AS similaridade
       FROM ${SCHEMA}.faq ORDER BY embedding <=> $1 LIMIT 8`, [pgvector.toSql(v)]);
  return rows
    .map((r) => ({ ...r, score: Number(r.similaridade) + (interesses.includes(r.categoria) ? 0.05 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => ({ categoria: r.categoria, pergunta: r.pergunta, resposta: r.resposta, score: Number(r.score.toFixed(3)) }));
}
