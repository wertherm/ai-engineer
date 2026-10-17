// Acesso ao Postgres (schema m03) + seed idempotente do mini-CRM/billing fictício.
import pg from 'pg';

// DATE (OID 1082) volta como string 'AAAA-MM-DD'. Sem isso o pg cria um Date à meia-noite local
// e toISOString() pode mudar o dia conforme o fuso da máquina.
pg.types.setTypeParser(1082, (v) => v);

export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://ia:ia@localhost:5433/ia';

export function criarPool() {
  // search_path no schema do módulo: nunca escrevemos no public.
  return new pg.Pool({ connectionString: DATABASE_URL, max: 3, options: '-c search_path=m03' });
}

export async function resetarBanco(pool) {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS m03;
    DROP TABLE IF EXISTS m03.faturas, m03.clientes;
    CREATE TABLE m03.clientes (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      plano TEXT NOT NULL CHECK (plano IN ('basico', 'pro', 'enterprise'))
    );
    CREATE TABLE m03.faturas (
      id SERIAL PRIMARY KEY,
      cliente_id INT NOT NULL REFERENCES m03.clientes(id),
      valor NUMERIC(12,2) NOT NULL,
      vencimento DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga'))
    );
    INSERT INTO m03.clientes (nome, email, plano) VALUES
      ('Padaria Pão Quente', 'contato@paoquente.example', 'basico'),
      ('Oficina Turbo', 'financeiro@turbo.example', 'pro'),
      ('Clínica Sorriso', 'adm@sorriso.example', 'enterprise');
    INSERT INTO m03.faturas (cliente_id, valor, vencimento, status) VALUES
      (1, 199.90, '2026-09-10', 'paga'),
      (1, 199.90, '2026-10-10', 'aberta'),
      (1, 49.90,  '2026-10-20', 'aberta'),
      (2, 499.00, '2026-10-05', 'aberta'),
      (3, 1990.00, '2026-10-01', 'paga');
  `);
}

// Permite rodar "node db.js" para recriar os dados de demonstração.
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = criarPool();
  await resetarBanco(pool);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM faturas');
  console.log(`Schema m03 recriado: 3 clientes, ${rows[0].n} faturas.`);
  await pool.end();
}
