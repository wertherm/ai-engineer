// Multi-tenant simples por API key: cada empresa cliente recebe uma chave; guardamos só o SHA-256.
import { createHash } from 'node:crypto';

export const hashChave = (chave) => createHash('sha256').update(chave).digest('hex');

/** Cria/atualiza um tenant (idempotente). */
export async function salvarTenant(pool, { id, nome, apiKey, plano = 'free', cotaDiaria = 50 }) {
  await pool.query(
    `INSERT INTO m11.tenants (id, nome, api_key_hash, plano, cota_diaria) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET nome = $2, api_key_hash = $3, plano = $4, cota_diaria = $5`,
    [id, nome, hashChave(apiKey), plano, cotaDiaria],
  );
}

/** Autenticador usado pela API e pelo MCP: chave -> tenant (ou null). Consulta por hash (índice UNIQUE). */
export function criarAutenticador(pool) {
  return async (apiKey) => {
    if (!apiKey) return null;
    const { rows } = await pool.query(
      'SELECT id, nome, plano, cota_diaria AS "cotaDiaria" FROM m11.tenants WHERE api_key_hash = $1',
      [hashChave(apiKey)],
    );
    return rows[0] ?? null;
  };
}

// Chaves de DEMONSTRAÇÃO (estudo local). Em produção: gerar com crypto.randomBytes e entregar uma vez.
export const TENANTS_DEMO = [
  { id: 'acme', nome: 'Acme Software', apiKey: 'sk-acme-demo', plano: 'pro', cotaDiaria: 200 },
  { id: 'padaria', nome: 'Padaria Pão Quente', apiKey: 'sk-padaria-demo', plano: 'free', cotaDiaria: 20 },
];
