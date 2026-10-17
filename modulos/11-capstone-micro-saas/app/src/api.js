// API do Micro-SaaS (Fastify): REST versionada em /v1, documentada em OpenAPI (/openapi.json e /docs),
// e o endpoint MCP (/mcp, Streamable HTTP stateless) no MESMO processo e com a MESMA autenticação.
// Padrões do módulo 02 (app.js: buildApp injetável, auth Bearer, validação, 502 para falha do provedor)
// e do módulo 03 (MCP HTTP com token, rate limit, validação de Origin).
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { criarServidorMcp } from './mcp.js';

const ORIGENS_PADRAO = 'http://localhost:31181,http://127.0.0.1:31181,http://localhost:4200';

const Erro = { type: 'object', properties: { erro: { type: 'string' } } };
const Citacao = {
  type: 'object',
  properties: { n: { type: 'integer' }, fonte: { type: 'string' }, trecho: { type: 'string' } },
};
const Resposta = {
  type: 'object',
  properties: {
    resposta: { type: 'string' },
    modo: { type: 'string', enum: ['rag', 'agente'] },
    citacoes: { type: 'array', items: Citacao },
    verificado: { type: 'boolean', description: 'true = toda citação aponta para um trecho recuperado' },
    cache: { type: 'boolean' },
    tokens: { type: 'integer' },
    ms: { type: 'integer' },
  },
};
const Trecho = {
  type: 'object',
  properties: { fonte: { type: 'string' }, titulo: { type: 'string' }, conteudo: { type: 'string' }, sim: { type: 'number' } },
};
const Documento = {
  type: 'object',
  properties: { fonte: { type: 'string' }, titulo: { type: 'string' }, chunks: { type: 'integer' } },
};
const seguro = [{ apiKey: [] }];

/** Rate limit por tenant (janela fixa, em memória: suficiente para 1 réplica; com N réplicas, Redis/gateway). */
function criarRateLimit({ limite, janelaMs }) {
  const janelas = new Map();
  return (chave) => {
    const t = Date.now();
    let j = janelas.get(chave);
    if (!j || t - j.inicio >= janelaMs) janelas.set(chave, (j = { inicio: t, n: 0 }));
    j.n++;
    return { ok: j.n <= limite, restante: Math.max(0, limite - j.n), retry: Math.ceil((j.inicio + janelaMs - t) / 1000) };
  };
}

export async function buildApp({
  servico,
  autenticar,
  logger = false,
  rateLimit = { limite: 60, janelaMs: 60_000 },
  origens = (process.env.ORIGENS_PERMITIDAS ?? ORIGENS_PADRAO).split(','),
  ganchos = [], // plugins extras recebem (escopoV1) — usado pelo exercício 01 (cota diária)
}) {
  const app = Fastify({ logger, bodyLimit: 64 * 1024 });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Políticas com Fonte · API',
        version: '1.0.0',
        description: 'Micro-SaaS que responde dúvidas sobre as políticas internas de pequenas empresas, com citações verificadas. Multi-tenant por API key.',
      },
      components: { securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', description: 'API key do cliente (tenant)' } } },
      tags: [{ name: 'politicas' }, { name: 'operacao' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { schema: { tags: ['operacao'], hide: false } }, async () => ({ status: 'ok' }));
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  const limitar = criarRateLimit(rateLimit);

  // Autenticação + rate limit compartilhados por /v1 e /mcp: o tenant vai para req.tenant.
  async function autenticacao(req, reply) {
    const [tipo, chave] = (req.headers.authorization ?? '').split(' ');
    const tenant = tipo === 'Bearer' ? await autenticar(chave) : null;
    if (!tenant) return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ erro: 'API key ausente ou inválida' });
    const rl = limitar(tenant.id);
    reply.header('RateLimit-Remaining', String(rl.restante));
    if (!rl.ok) return reply.code(429).header('Retry-After', String(rl.retry)).send({ erro: 'limite de requisições excedido' });
    req.tenant = tenant;
  }

  await app.register(
    async (v1) => {
      v1.addHook('onRequest', autenticacao);
      for (const g of ganchos) await g(v1);

      v1.get('/me', {
        schema: {
          tags: ['politicas'], security: seguro, summary: 'Tenant autenticado',
          response: { 200: { type: 'object', properties: { id: { type: 'string' }, nome: { type: 'string' }, plano: { type: 'string' } } } },
        },
      }, async (req) => ({ id: req.tenant.id, nome: req.tenant.nome, plano: req.tenant.plano }));

      v1.get('/documentos', {
        schema: { tags: ['politicas'], security: seguro, summary: 'Lista os documentos indexados', response: { 200: { type: 'array', items: Documento } } },
      }, async (req) => servico.listarDocumentos(req.tenant));

      v1.post('/documentos', {
        schema: {
          tags: ['politicas'], security: seguro, summary: 'Envia (ou substitui) um documento de política em Markdown',
          body: {
            type: 'object', required: ['fonte', 'texto'], additionalProperties: false,
            properties: {
              fonte: { type: 'string', pattern: '^[a-z0-9-]{1,60}\\.md$', description: 'nome do arquivo, ex.: ferias.md' },
              texto: { type: 'string', minLength: 20, maxLength: 20000, description: 'Markdown: 1ª linha "# Título", parágrafos separados por linha em branco' },
            },
          },
          response: { 201: { type: 'object', properties: { fonte: { type: 'string' }, chunks: { type: 'integer' } } }, 400: Erro },
        },
      }, async (req, reply) => reply.code(201).send(await servico.indexar(req.tenant, req.body)));

      v1.delete('/documentos/:fonte', {
        schema: {
          tags: ['politicas'], security: seguro, summary: 'Remove um documento (e invalida o cache do tenant)',
          params: { type: 'object', properties: { fonte: { type: 'string', pattern: '^[a-z0-9-]{1,60}\\.md$' } } },
          response: { 200: { type: 'object', properties: { fonte: { type: 'string' }, removidos: { type: 'integer' } } }, 404: Erro },
        },
      }, async (req, reply) => {
        const r = await servico.remover(req.tenant, req.params.fonte);
        return r.removidos ? r : reply.code(404).send({ erro: 'documento não encontrado' });
      });

      v1.post('/busca', {
        schema: {
          tags: ['politicas'], security: seguro, summary: 'Busca híbrida de trechos (sem LLM)',
          body: {
            type: 'object', required: ['consulta'], additionalProperties: false,
            properties: { consulta: { type: 'string', minLength: 3, maxLength: 300 }, k: { type: 'integer', minimum: 1, maximum: 8, default: 4 } },
          },
          response: { 200: { type: 'array', items: Trecho } },
        },
      }, async (req) => servico.buscar(req.tenant, req.body.consulta, { k: req.body.k, canal: 'rest' }));

      v1.post('/perguntas', {
        schema: {
          tags: ['politicas'], security: seguro, summary: 'Responde uma pergunta com citações verificadas',
          body: {
            type: 'object', required: ['pergunta'], additionalProperties: false,
            properties: {
              pergunta: { type: 'string', minLength: 3, maxLength: 500 },
              modo: { type: 'string', enum: ['rag', 'agente'], default: 'rag', description: 'agente = várias buscas (perguntas complexas)' },
            },
          },
          response: { 200: Resposta, 502: Erro },
        },
      }, async (req, reply) => {
        try {
          return await servico.perguntar(req.tenant, req.body.pergunta, { modo: req.body.modo, canal: 'rest' });
        } catch (err) {
          // Falha do provedor de IA não é erro do cliente: 502 diz "a dependência falhou, tente depois".
          req.log.error({ err: err.message }, 'falha no LLM');
          return reply.code(502).send({ erro: 'provedor de IA indisponível' });
        }
      });
    },
    { prefix: '/v1' },
  );

  // ---- MCP (Streamable HTTP, stateless) ----
  await app.register(async (mcp) => {
    mcp.addHook('onRequest', async (req, reply) => {
      // Anti DNS rebinding (exigência da spec MCP): Origin, quando presente, precisa estar na allowlist.
      const origem = req.headers.origin;
      if (origem && !origens.includes(origem)) return reply.code(403).send({ erro: `Origin não permitida: ${origem}` });
    });
    mcp.addHook('onRequest', autenticacao);

    mcp.post('/mcp', { schema: { hide: true } }, async (req, reply) => {
      const server = criarServidorMcp(servico, req.tenant);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      reply.hijack(); // a partir daqui quem escreve a resposta é o transport do SDK, não o Fastify
      reply.raw.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    });
    const naoPermitido = async (_req, reply) => reply.code(405).header('Allow', 'POST').send({ erro: 'servidor MCP stateless: use POST' });
    mcp.get('/mcp', { schema: { hide: true } }, naoPermitido);
    mcp.delete('/mcp', { schema: { hide: true } }, naoPermitido);
  });

  return app;
}
