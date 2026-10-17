// MCP "de produção": Streamable HTTP (stateless) + service token (Bearer) + rate limit + auditoria
// + proteção contra DNS rebinding. Serviço exposto: catálogo de produtos (dados em memória).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { z } from 'zod';
import { verificadorDeTokens, rateLimitPorCliente, auditoria } from './seguranca.js';

const PORT = Number(process.env.PORT ?? 30340);
const LIMITE = Number(process.env.RATE_LIMIT ?? 8);
const JANELA_MS = Number(process.env.RATE_WINDOW_MS ?? 60_000);

const PRODUTOS = [
  { sku: 'CAF-001', nome: 'Café especial 500g', categoria: 'mercearia', preco: 42.9, estoque: 120 },
  { sku: 'CAF-002', nome: 'Café descafeinado 250g', categoria: 'mercearia', preco: 29.5, estoque: 0 },
  { sku: 'MOE-010', nome: 'Moedor manual', categoria: 'utensilios', preco: 189.0, estoque: 7 },
];

function criarServidor() {
  const server = new McpServer({ name: 'catalogo-produtos', version: '1.0.0' });
  server.registerTool(
    'listar_produtos',
    {
      description: 'Lista produtos do catálogo, opcionalmente por categoria',
      inputSchema: { categoria: z.enum(['mercearia', 'utensilios']).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ categoria }) => {
      const itens = PRODUTOS.filter((p) => !categoria || p.categoria === categoria);
      return { content: [{ type: 'text', text: JSON.stringify(itens) }] };
    },
  );
  server.registerTool(
    'consultar_estoque',
    {
      description: 'Consulta estoque e preço de um SKU',
      inputSchema: { sku: z.string().regex(/^[A-Z]{3}-\d{3}$/) },
      annotations: { readOnlyHint: true },
    },
    async ({ sku }) => {
      const p = PRODUTOS.find((x) => x.sku === sku);
      if (!p) return { isError: true, content: [{ type: 'text', text: `SKU ${sku} não encontrado` }] };
      return { content: [{ type: 'text', text: JSON.stringify({ sku, preco: p.preco, estoque: p.estoque }) }] };
    },
  );
  // A identidade autenticada chega ao handler em extra.authInfo: útil para autorização fina e auditoria.
  server.registerTool(
    'quem_sou_eu',
    { description: 'Mostra o cliente autenticado e seus escopos', annotations: { readOnlyHint: true } },
    async (extra) => ({ content: [{ type: 'text', text: JSON.stringify({ cliente: extra.authInfo?.clientId, escopos: extra.authInfo?.scopes }) }] }),
  );
  return server;
}

// host 127.0.0.1 => o SDK liga a validação do header Host (anti DNS rebinding) e o express.json().
const app = createMcpExpressApp({ host: '127.0.0.1' });
app.disable('x-powered-by');

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/mcp', auditoria);
app.use('/mcp', requireBearerAuth({ verifier: verificadorDeTokens, requiredScopes: ['produtos:ler'] }));
app.use('/mcp', rateLimitPorCliente({ limite: LIMITE, janelaMs: JANELA_MS }));

// Stateless: um McpServer + transport por requisição (escala horizontal sem sessão grudada).
app.post('/mcp', async (req, res) => {
  const server = criarServidor();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('erro MCP:', err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno' }, id: null });
  }
});
// Sem sessão não há stream de notificações (GET) nem encerramento de sessão (DELETE).
const naoPermitido = (_req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método não permitido' }, id: null });
app.get('/mcp', naoPermitido);
app.delete('/mcp', naoPermitido);

app.listen(PORT, '127.0.0.1', () => console.error(`[catalogo-produtos] MCP em http://127.0.0.1:${PORT}/mcp (limite ${LIMITE}/${JANELA_MS / 1000}s)`));
