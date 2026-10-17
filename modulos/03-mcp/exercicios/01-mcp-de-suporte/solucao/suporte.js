// Solução do exercício 1: MCP de um serviço novo (central de suporte / tickets).
// A fábrica recebe o repositório por injeção: em teste usamos memória, em produção seria o banco.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function criarRepositorioEmMemoria() {
  const tickets = new Map();
  let seq = 0;
  return {
    abrir: (dados) => { const t = { id: ++seq, status: 'aberto', resolucao: null, ...dados }; tickets.set(t.id, t); return t; },
    listar: (status) => [...tickets.values()].filter((t) => !status || t.status === status),
    buscar: (id) => tickets.get(id) ?? null,
    fechar: (id, resolucao) => { const t = tickets.get(id); Object.assign(t, { status: 'fechado', resolucao }); return t; },
  };
}

const Ticket = z.object({
  id: z.number(), cliente: z.string(), assunto: z.string(),
  prioridade: z.enum(['baixa', 'media', 'alta']), status: z.enum(['aberto', 'fechado']), resolucao: z.string().nullable(),
});
const ok = (dados) => ({ content: [{ type: 'text', text: JSON.stringify(dados) }], structuredContent: dados });
const erro = (msg) => ({ isError: true, content: [{ type: 'text', text: msg }] });

export function criarServidorSuporte(repo = criarRepositorioEmMemoria()) {
  const server = new McpServer({ name: 'suporte', version: '1.0.0' });

  server.registerTool(
    'abrir_ticket',
    {
      description: 'Abre um ticket de suporte para um cliente',
      inputSchema: {
        cliente: z.string().min(2),
        assunto: z.string().min(5).max(200),
        prioridade: z.enum(['baixa', 'media', 'alta']).default('media'),
      },
      outputSchema: { ticket: Ticket },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => ok({ ticket: repo.abrir(args) }),
  );

  server.registerTool(
    'listar_tickets',
    {
      description: 'Lista tickets, opcionalmente por status',
      inputSchema: { status: z.enum(['aberto', 'fechado']).optional() },
      outputSchema: { tickets: z.array(Ticket) },
      annotations: { readOnlyHint: true },
    },
    async ({ status }) => ok({ tickets: repo.listar(status) }),
  );

  server.registerTool(
    'fechar_ticket',
    {
      description: 'Fecha um ticket aberto registrando a resolução',
      inputSchema: { id: z.number().int().positive(), resolucao: z.string().min(5) },
      outputSchema: { ticket: Ticket },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, resolucao }) => {
      const t = repo.buscar(id);
      if (!t) return erro(`Ticket ${id} não existe.`);
      if (t.status === 'fechado') return erro(`Ticket ${id} já está fechado.`);
      return ok({ ticket: repo.fechar(id, resolucao) });
    },
  );

  server.registerResource(
    'ticket',
    new ResourceTemplate('suporte://tickets/{id}', { list: undefined }),
    { title: 'Ticket', mimeType: 'application/json' },
    async (uri, { id }) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(repo.buscar(Number(id))) }] }),
  );

  return server;
}
