// Contrato da API e do MCP com dublês (sem banco, sem LLM): roda em ~1 s e é o que o CI executa.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/api.js';

const TENANTS = { 'k-acme': { id: 'acme', nome: 'Acme', plano: 'pro' }, 'k-pad': { id: 'padaria', nome: 'Padaria', plano: 'free' } };
const autenticar = async (k) => TENANTS[k] ?? null;
const auth = (k = 'k-acme') => ({ authorization: `Bearer ${k}` });

function servicoFalso() {
  return {
    listarDocumentos: vi.fn(async (t) => [{ fonte: `${t.id}.md`, titulo: 'T', chunks: 1 }]),
    indexar: vi.fn(async (_t, d) => ({ fonte: d.fonte, chunks: 2 })),
    buscar: vi.fn(async (t, q) => [{ fonte: `${t.id}.md`, titulo: 'T', conteudo: `trecho sobre ${q}`, sim: 0.8, rrf: 0.03 }]),
    perguntar: vi.fn(async () => ({ resposta: 'São 30 dias [1].', modo: 'rag', citacoes: [{ n: 1, fonte: 'ferias.md', trecho: 'x' }], verificado: true, cache: false, tokens: 10, ms: 5 })),
  };
}

describe('REST /v1', () => {
  it('401 sem API key e o serviço nem é chamado', async () => {
    const servico = servicoFalso();
    const app = await buildApp({ servico, autenticar });
    const r = await app.inject({ method: 'GET', url: '/v1/documentos' });
    expect(r.statusCode).toBe(401);
    expect(servico.listarDocumentos).not.toHaveBeenCalled();
  });

  it('o tenant vem da API key (isolamento): cada chave enxerga o seu', async () => {
    const app = await buildApp({ servico: servicoFalso(), autenticar });
    const a = await app.inject({ method: 'GET', url: '/v1/documentos', headers: auth('k-acme') });
    const p = await app.inject({ method: 'GET', url: '/v1/documentos', headers: auth('k-pad') });
    expect(a.json()[0].fonte).toBe('acme.md');
    expect(p.json()[0].fonte).toBe('padaria.md');
  });

  it('400 na validação antes de gastar tokens', async () => {
    const servico = servicoFalso();
    const app = await buildApp({ servico, autenticar });
    const r = await app.inject({ method: 'POST', url: '/v1/perguntas', headers: auth(), payload: { pergunta: 'x' } });
    expect(r.statusCode).toBe(400);
    expect(servico.perguntar).not.toHaveBeenCalled();
    const d = await app.inject({ method: 'POST', url: '/v1/documentos', headers: auth(), payload: { fonte: '../etc/passwd', texto: 'x'.repeat(30) } });
    expect(d.statusCode).toBe(400);
  });

  it('200 com citações; o modo padrão é rag', async () => {
    const servico = servicoFalso();
    const app = await buildApp({ servico, autenticar });
    const r = await app.inject({ method: 'POST', url: '/v1/perguntas', headers: auth(), payload: { pergunta: 'Quantos dias de férias?' } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ verificado: true, citacoes: [{ n: 1, fonte: 'ferias.md' }] });
    expect(servico.perguntar).toHaveBeenCalledWith(TENANTS['k-acme'], 'Quantos dias de férias?', { modo: 'rag', canal: 'rest' });
  });

  it('502 quando o provedor de IA falha', async () => {
    const servico = servicoFalso();
    servico.perguntar.mockRejectedValue(new Error('ECONNREFUSED'));
    const app = await buildApp({ servico, autenticar });
    const r = await app.inject({ method: 'POST', url: '/v1/perguntas', headers: auth(), payload: { pergunta: 'Quantos dias?' } });
    expect(r.statusCode).toBe(502);
  });

  it('429 ao estourar o rate limit do tenant (o outro tenant segue livre)', async () => {
    const app = await buildApp({ servico: servicoFalso(), autenticar, rateLimit: { limite: 2, janelaMs: 60_000 } });
    const codigos = [];
    for (let i = 0; i < 3; i++) codigos.push((await app.inject({ method: 'GET', url: '/v1/me', headers: auth() })).statusCode);
    expect(codigos).toEqual([200, 200, 429]);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: auth('k-pad') })).statusCode).toBe(200);
  });

  it('publica o contrato OpenAPI 3.1 com segurança bearer', async () => {
    const app = await buildApp({ servico: servicoFalso(), autenticar });
    const spec = (await app.inject({ method: 'GET', url: '/openapi.json' })).json();
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/v1/perguntas', '/v1/busca', '/v1/documentos']));
    expect(spec.components.securitySchemes.apiKey.scheme).toBe('bearer');
  });
});

describe('MCP /mcp (cliente oficial do SDK)', () => {
  let app;
  let servico;
  const url = new URL('http://127.0.0.1:31110/mcp');
  beforeAll(async () => {
    servico = servicoFalso();
    app = await buildApp({ servico, autenticar });
    await app.listen({ port: 31110, host: '127.0.0.1' });
  });
  afterAll(() => app.close());

  async function conectar(chave) {
    const client = new Client({ name: 'teste', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: auth(chave) } }));
    return client;
  }

  it('lista as 3 tools e chama buscar_politicas no tenant da chave', async () => {
    const client = await conectar('k-pad');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['buscar_politicas', 'listar_documentos', 'perguntar']);
    const r = await client.callTool({ name: 'buscar_politicas', arguments: { consulta: 'turno', k: 1 } });
    expect(r.structuredContent.itens[0].fonte).toBe('padaria.md');
    expect(servico.buscar).toHaveBeenCalledWith(TENANTS['k-pad'], 'turno', { k: 1, canal: 'mcp' });
    await client.close();
  });

  it('rejeita chave inválida e Origin fora da allowlist', async () => {
    await expect(conectar('k-errada')).rejects.toThrow();
    const r = await fetch(url, { method: 'POST', headers: { ...auth(), origin: 'http://evil.example', 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(403);
  });
});
