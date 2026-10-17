// Audit Trail append-only no Postgres, com encadeamento de hash (cada linha guarda o hash da anterior).
// Um trigger impede UPDATE/DELETE; e se alguém burlar o trigger (ex.: superusuário), a cadeia quebra e a
// verificação acusa. É o mesmo princípio de um ledger/blockchain, sem a parte distribuída.
import { createHash } from 'node:crypto';

export async function criarAuditoria(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS m08.auditoria;
    CREATE TABLE m08.auditoria (
      seq bigserial PRIMARY KEY, em timestamptz NOT NULL DEFAULT now(),
      ator text NOT NULL, evento text NOT NULL, acao_id text NOT NULL, dados jsonb NOT NULL,
      hash_anterior text NOT NULL, hash text NOT NULL);
    CREATE OR REPLACE FUNCTION m08.auditoria_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'auditoria é append-only (% bloqueado)', TG_OP; END $$;
    CREATE TRIGGER auditoria_imutavel BEFORE UPDATE OR DELETE ON m08.auditoria
      FOR EACH ROW EXECUTE FUNCTION m08.auditoria_imutavel();`);
}

// JSON canônico (chaves ordenadas): o jsonb do Postgres REORDENA as chaves ao gravar, então o objeto lido
// de volta pode serializar diferente do original e o hash não bateria.
const canonico = (v) =>
  Array.isArray(v) ? v.map(canonico)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonico(v[k])]))
  : v;
const calcularHash = (anterior, ator, evento, acaoId, dados) =>
  createHash('sha256').update(JSON.stringify(canonico([anterior, ator, evento, acaoId, dados]))).digest('hex');

export async function registrar(pool, { ator, evento, acaoId, dados }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock da tabela serializa os escritores: sem isso, dois eventos simultâneos usariam o mesmo "anterior".
    await client.query('LOCK TABLE m08.auditoria IN EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT hash FROM m08.auditoria ORDER BY seq DESC LIMIT 1');
    const anterior = rows[0]?.hash ?? 'genesis';
    const hash = calcularHash(anterior, ator, evento, acaoId, dados);
    await client.query(
      'INSERT INTO m08.auditoria (ator, evento, acao_id, dados, hash_anterior, hash) VALUES ($1,$2,$3,$4,$5,$6)',
      [ator, evento, acaoId, dados, anterior, hash],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Recalcula a cadeia inteira; devolve a primeira seq adulterada ou null. */
export async function verificarCadeia(pool) {
  const { rows } = await pool.query('SELECT * FROM m08.auditoria ORDER BY seq');
  let anterior = 'genesis';
  for (const r of rows) {
    if (r.hash_anterior !== anterior || calcularHash(anterior, r.ator, r.evento, r.acao_id, r.dados) !== r.hash) return r.seq;
    anterior = r.hash;
  }
  return null;
}
