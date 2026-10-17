// Integração REAL (Postgres + embeddings do Ollama; sem LLM de chat, então leva segundos).
// Pré-requisito: npm run seed. Rode com: npm run test:integracao
import { afterAll, describe, expect, it } from 'vitest';
import { criarPool } from '../src/db.js';
import { criarLlm } from '../src/llm.js';
import { criarServico } from '../src/servico.js';
import { criarAutenticador } from '../src/tenants.js';

const ativo = process.env.INTEGRACAO === '1';

// Timeout alto: o Ollama é compartilhado e pode enfileirar o embedding atrás de outras chamadas.
describe.skipIf(!ativo)('integração: multi-tenant no banco real', { timeout: 300_000 }, () => {
  const pool = ativo ? criarPool() : null;
  afterAll(() => pool?.end());

  it('a API key resolve o tenant certo (e chave errada não resolve)', async () => {
    const autenticar = criarAutenticador(pool);
    expect((await autenticar('sk-acme-demo')).id).toBe('acme');
    expect(await autenticar('sk-inexistente')).toBeNull();
  });

  it('busca nunca devolve documento de outro tenant', async () => {
    const servico = criarServico({ pool, llm: criarLlm() });
    const acme = await servico.buscar({ id: 'acme' }, 'troca de turno na padaria', { k: 8, canal: 'teste' });
    const padaria = await servico.buscar({ id: 'padaria' }, 'auxílio home office e VPN', { k: 8, canal: 'teste' });
    const docsDe = async (id) => (await servico.listarDocumentos({ id })).map((d) => d.fonte);
    expect(acme.every((t) => t.conteudo.includes('Acme'))).toBe(true);
    expect(padaria.every((t) => t.conteudo.includes('Padaria'))).toBe(true);
    expect(await docsDe('acme')).toContain('home-office.md');
    expect(await docsDe('padaria')).not.toContain('home-office.md');
  });

  it('DELETE de documento inexistente não apaga o cache do tenant', async () => {
    const servico = criarServico({ pool, llm: criarLlm() });
    const contar = async () => (await pool.query("SELECT count(*)::int AS n FROM m11.cache WHERE tenant_id = 'acme'")).rows[0].n;
    const antes = await contar();
    expect((await servico.remover({ id: 'acme' }, 'nao-existe.md', { canal: 'teste' })).removidos).toBe(0);
    expect(await contar()).toBe(antes);
  });

  it('pergunta fora do tema responde o fallback SEM chamar o LLM de chat', async () => {
    const llm = criarLlm();
    llm.chat = () => { throw new Error('não deveria chamar o chat'); };
    const servico = criarServico({ pool, llm });
    const r = await servico.perguntar({ id: 'padaria', nome: 'Padaria' }, 'Qual o limite de alimentação em viagem?', { canal: 'teste' });
    expect(r.resposta).toMatch(/Não encontrei/);
  });
});
