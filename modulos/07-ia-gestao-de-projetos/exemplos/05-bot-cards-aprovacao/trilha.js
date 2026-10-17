// Trilha de decisão no Postgres (schema m07), encadeada por hash: alterar uma linha antiga quebra a cadeia.
import { createHash } from 'node:crypto';
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://ia:ia@localhost:5433/ia' });

export async function prepararTrilha() {
  await pool.query('CREATE SCHEMA IF NOT EXISTS m07');
  await pool.query(`CREATE TABLE IF NOT EXISTS m07.trilha_bot (
    id bigserial PRIMARY KEY,
    criado_em timestamptz NOT NULL DEFAULT now(),
    solicitante text NOT NULL,
    pedido text NOT NULL,
    operacao jsonb NOT NULL,
    status text NOT NULL,          -- executado | aguardando_aprovacao | aprovado_e_executado | erro
    motivo text,
    hash_anterior text NOT NULL,
    hash text NOT NULL
  )`);
}

// JSON canônico (chaves ordenadas): o jsonb do Postgres NÃO preserva a ordem das chaves do objeto gravado,
// então sem isso o hash recalculado na leitura pode divergir do hash gravado mesmo sem adulteração.
const canonico = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`
  : Array.isArray(v) ? `[${v.map(canonico).join(',')}]` : JSON.stringify(v ?? null));

export const hashDe = (anterior, r) =>
  createHash('sha256').update(anterior + canonico([r.solicitante, r.pedido, r.operacao, r.status, r.motivo ?? null])).digest('hex');

export async function registrar(r) {
  const { rows } = await pool.query('SELECT hash FROM m07.trilha_bot ORDER BY id DESC LIMIT 1');
  const anterior = rows[0]?.hash ?? 'genesis';
  await pool.query(
    'INSERT INTO m07.trilha_bot (solicitante, pedido, operacao, status, motivo, hash_anterior, hash) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [r.solicitante, r.pedido, r.operacao, r.status, r.motivo ?? null, anterior, hashDe(anterior, r)],
  );
}

// Auditoria: recalcula a cadeia inteira. Retorna o id da primeira linha adulterada ou null.
export async function verificarTrilha() {
  const { rows } = await pool.query('SELECT * FROM m07.trilha_bot ORDER BY id');
  let anterior = 'genesis';
  for (const r of rows) {
    if (r.hash_anterior !== anterior || r.hash !== hashDe(anterior, r)) return { ok: false, linha: r.id, total: rows.length };
    anterior = r.hash;
  }
  return { ok: true, total: rows.length };
}
