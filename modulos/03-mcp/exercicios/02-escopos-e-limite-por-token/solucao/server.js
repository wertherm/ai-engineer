// Solução do exercício 2: escopos por tool + rate limit por token (token bucket com cota por plano).
import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { z } from 'zod';

const PORT = Number(process.env.PORT ?? 30360);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Cota por plano: capacidade do balde e recarga (tokens por segundo).
const PLANOS = { free: { capacidade: 3, recargaPorSeg: 0.05 }, pro: { capacidade: 20, recargaPorSeg: 1 } };

const exp = Math.floor(Date.now() / 1000) + 3600;
const TOKENS = new Map([
  [sha256('tok-leitor'), { clientId: 'dashboard', plano: 'free', scopes: ['catalogo:ler'] }],
  [sha256('tok-editor'), { clientId: 'backoffice', plano: 'pro', scopes: ['catalogo:ler', 'catalogo:escrever'] }],
]);

const verifier = {
  async verifyAccessToken(token) {
    const r = TOKENS.get(sha256(token));
    if (!r) throw new InvalidTokenError('Token inválido');
    // "extra" leva dados próprios (aqui, o plano) até os middlewares e handlers.
    return { token, clientId: r.clientId, scopes: r.scopes, expiresAt: exp, extra: { plano: r.plano } };
  },
};

// Token bucket por clientId: permite rajadas curtas (capacidade) e limita a média (recarga).
function tokenBucket() {
  const baldes = new Map();
  return (req, res, next) => {
    const { clientId, extra } = req.auth;
    const { capacidade, recargaPorSeg } = PLANOS[extra.plano];
    const agora = Date.now() / 1000;
    const b = baldes.get(clientId) ?? { fichas: capacidade, ultimo: agora };
    b.fichas = Math.min(capacidade, b.fichas + (agora - b.ultimo) * recargaPorSeg);
    b.ultimo = agora;
    baldes.set(clientId, b);
    if (b.fichas < 1) {
      res.set('Retry-After', String(Math.ceil((1 - b.fichas) / recargaPorSeg)));
      return res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: `Cota do plano ${extra.plano} esgotada` }, id: null });
    }
    b.fichas -= 1;
    next();
  };
}

const precos = new Map([['CAF-001', 42.9], ['MOE-010', 189.0]]);

// Tool -> escopo exigido. Fonte única da verdade para filtrar o tools/list E checar no handler.
const ESCOPO_DA_TOOL = { consultar_preco: 'catalogo:ler', ajustar_preco: 'catalogo:escrever' };

function criarServidor(authInfo) {
  const server = new McpServer({ name: 'catalogo-escopos', version: '1.0.0' });
  const pode = (tool) => authInfo.scopes.includes(ESCOPO_DA_TOOL[tool]);
  const negar = (tool) => ({ isError: true, content: [{ type: 'text', text: `Escopo ${ESCOPO_DA_TOOL[tool]} necessário` }] });

  // Só registra o que o token pode usar: o modelo nem fica sabendo que a tool existe.
  if (pode('consultar_preco')) {
    server.registerTool('consultar_preco', { description: 'Preço de um SKU', inputSchema: { sku: z.string() }, annotations: { readOnlyHint: true } },
      async ({ sku }, extra) => {
        if (!extra.authInfo.scopes.includes(ESCOPO_DA_TOOL.consultar_preco)) return negar('consultar_preco'); // defesa em profundidade
        return { content: [{ type: 'text', text: JSON.stringify({ sku, preco: precos.get(sku) ?? null }) }] };
      });
  }
  if (pode('ajustar_preco')) {
    server.registerTool('ajustar_preco', {
      description: 'Ajusta o preço de um SKU (máx. 20% por vez)',
      inputSchema: { sku: z.string(), novo_preco: z.number().positive() },
      annotations: { readOnlyHint: false, destructiveHint: true },
    }, async ({ sku, novo_preco }, extra) => {
      if (!extra.authInfo.scopes.includes(ESCOPO_DA_TOOL.ajustar_preco)) return negar('ajustar_preco');
      const atual = precos.get(sku);
      if (atual === undefined) return { isError: true, content: [{ type: 'text', text: `SKU ${sku} não existe` }] };
      // Regra de negócio no servidor: o LLM não pode dar um desconto de 90% "por engano".
      if (Math.abs(novo_preco - atual) / atual > 0.2) return { isError: true, content: [{ type: 'text', text: 'Variação acima de 20% exige aprovação humana' }] };
      precos.set(sku, novo_preco);
      console.log(JSON.stringify({ auditoria: 'ajuste_preco', cliente: extra.authInfo.clientId, sku, de: atual, para: novo_preco }));
      return { content: [{ type: 'text', text: JSON.stringify({ sku, preco: novo_preco }) }] };
    });
  }
  return server;
}

const app = createMcpExpressApp({ host: '127.0.0.1' });
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/mcp', requireBearerAuth({ verifier }), tokenBucket(), async (req, res) => {
  const server = criarServidor(req.auth);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.listen(PORT, '127.0.0.1', () => console.error(`[catalogo-escopos] http://127.0.0.1:${PORT}/mcp`));
