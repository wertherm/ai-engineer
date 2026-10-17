// Testes da cota: dublê do serviço (sem LLM) + contador em memória; e um teste do contador no Postgres
// real (rápido, sem LLM) quando INTEGRACAO=1.
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app/src/api.js';
import { criarPool } from '../../../app/src/db.js';
import { criarContadorMemoria, criarContadorPg, cotaDiaria } from './cota.js';

const TENANTS = {
  'k-free': { id: 'padaria', nome: 'Padaria', plano: 'free', cotaDiaria: 2 },
  'k-pro': { id: 'acme', nome: 'Acme', plano: 'pro', cotaDiaria: 200 },
};
const servico = { perguntar: vi.fn(async () => ({ resposta: 'ok [1]', citacoes: [], verificado: true, cache: false, ms: 1 })), listarDocumentos: vi.fn(async () => []) };
const perguntar = (app, chave) => app.inject({
  method: 'POST', url: '/v1/perguntas', headers: { authorization: `Bearer ${chave}` }, payload: { pergunta: 'Quantos dias de férias?' },
});

async function appCom(contador) {
  return buildApp({ servico, autenticar: async (k) => TENANTS[k] ?? null, ganchos: [cotaDiaria(contador)] });
}

describe('cota diária por tenant', () => {
  it('plano free: 2 perguntas passam, a 3ª recebe 429 com mensagem de upgrade', async () => {
    const app = await appCom(criarContadorMemoria());
    const r = [];
    for (let i = 0; i < 3; i++) r.push(await perguntar(app, 'k-free'));
    expect(r.map((x) => x.statusCode)).toEqual([200, 200, 429]);
    expect(r[1].headers['x-cota-restante']).toBe('0');
    expect(r[2].json().erro).toMatch(/upgrade/);
  });

  it('a cota de um tenant não afeta o outro', async () => {
    const app = await appCom(criarContadorMemoria());
    for (let i = 0; i < 3; i++) await perguntar(app, 'k-free');
    expect((await perguntar(app, 'k-pro')).statusCode).toBe(200);
  });

  it('a cota zera na virada do dia', async () => {
    let hoje = new Date('2026-10-16T23:59:00Z');
    const app = await appCom(criarContadorMemoria({ agora: () => hoje }));
    for (let i = 0; i < 3; i++) await perguntar(app, 'k-free');
    hoje = new Date('2026-10-17T00:01:00Z');
    expect((await perguntar(app, 'k-free')).statusCode).toBe(200);
  });

  it('só POST /v1/perguntas consome cota; GET /v1/uso mostra o consumo', async () => {
    const app = await appCom(criarContadorMemoria());
    await perguntar(app, 'k-free');
    await app.inject({ method: 'GET', url: '/v1/documentos', headers: { authorization: 'Bearer k-free' } });
    const uso = await app.inject({ method: 'GET', url: '/v1/uso', headers: { authorization: 'Bearer k-free' } });
    expect(uso.json()).toEqual({ tenant: 'padaria', plano: 'free', limite: 2, usadasHoje: 1 });
  });
});

describe.skipIf(process.env.INTEGRACAO !== '1')('contador no Postgres', () => {
  it('incremento atômico com 20 requisições simultâneas', async () => {
    const pool = criarPool();
    const contador = await criarContadorPg(pool);
    await pool.query("DELETE FROM m11.uso_diario WHERE tenant_id = 'teste-concorrencia'");
    const valores = await Promise.all(Array.from({ length: 20 }, () => contador.incrementar('teste-concorrencia')));
    expect(new Set(valores).size).toBe(20); // nenhum valor repetido = nenhuma corrida
    expect(await contador.consultar('teste-concorrencia')).toBe(20);
    await pool.query("DELETE FROM m11.uso_diario WHERE tenant_id = 'teste-concorrencia'");
    await pool.end();
  });
});
