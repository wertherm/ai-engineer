// Mini-aplicação web de tarefas: UI HTML + API REST + endpoint MCP (Streamable HTTP, stateless).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { criarServidorMcp } from './mcp.js';

const INDEX = readFileSync(join(import.meta.dirname, 'index.html'), 'utf8');
// Token de serviço para o MCP: o endpoint mexe no estado (resetar!), então não fica aberto.
// Em produção: OAuth/escopos como no módulo 03 (exemplo 04). Aqui, um Bearer fixo de demonstração.
export const MCP_TOKEN = process.env.MCP_TOKEN ?? 'tok-e2e-demo';

export function criarApp(estado, { extrasMcp } = {}) {
  // host 127.0.0.1 liga a proteção contra DNS rebinding (valida o header Host) e o express.json().
  const app = createMcpExpressApp({ host: '127.0.0.1' });
  app.disable('x-powered-by');

  app.get('/', (_req, res) => res.type('html').send(INDEX));
  app.get('/api/tarefas', (_req, res) => res.json(estado.listar()));
  app.post('/api/tarefas', (req, res) => {
    try { res.status(201).json(estado.adicionar(req.body?.titulo ?? '')); } catch (e) { res.status(400).json({ erro: e.message }); }
  });
  app.post('/api/tarefas/:id/concluir', (req, res) => {
    const t = estado.concluir(req.params.id);
    return t ? res.json(t) : res.status(404).json({ erro: 'não encontrada' });
  });

  app.post('/mcp', async (req, res) => {
    if (req.headers.authorization !== `Bearer ${MCP_TOKEN}`) return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Não autorizado' }, id: null });
    // Stateless: um McpServer + transport por requisição; o estado vive fora, em `estado`.
    const server = criarServidorMcp(estado, { extras: extrasMcp });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  return app;
}
