// "Empresa como MCP": a fábrica do servidor fica separada do transporte.
// Assim o mesmo servidor roda em stdio (server.js), em HTTP ou em testes com InMemoryTransport.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const Cliente = z.object({ id: z.number(), nome: z.string(), email: z.string(), plano: z.string() });
const Fatura = z.object({ id: z.number(), cliente_id: z.number(), valor: z.number(), vencimento: z.string(), status: z.string() });

// Resposta padronizada: texto (para o modelo) + JSON estruturado (para código).
const ok = (dados) => ({ content: [{ type: 'text', text: JSON.stringify(dados) }], structuredContent: dados });
// Erro de negócio vira isError: true; o modelo lê a mensagem e pode corrigir a chamada.
const erro = (msg) => ({ isError: true, content: [{ type: 'text', text: msg }] });

const linhaFatura = (r) => ({ ...r, valor: Number(r.valor) });

export function criarServidorCrm(pool) {
  const server = new McpServer(
    { name: 'crm-billing', version: '1.0.0' },
    { instructions: 'CRM e faturamento da Exemplo SA. Busque o cliente pelo nome antes de consultar faturas.' },
  );

  server.registerTool(
    'buscar_clientes',
    {
      title: 'Buscar clientes',
      description: 'Busca clientes pelo nome (parcial, sem diferenciar maiúsculas). Retorna id, nome, email e plano.',
      inputSchema: { termo: z.string().min(2).describe('Parte do nome do cliente') },
      outputSchema: { clientes: z.array(Cliente) },
      annotations: { readOnlyHint: true },
    },
    async ({ termo }) => {
      const { rows } = await pool.query('SELECT id, nome, email, plano FROM clientes WHERE nome ILIKE $1 ORDER BY id', [`%${termo}%`]);
      return ok({ clientes: rows });
    },
  );

  server.registerTool(
    'listar_faturas',
    {
      title: 'Listar faturas',
      description: 'Lista as faturas de um cliente pelo id numérico. Filtro opcional por status (aberta ou paga).',
      inputSchema: { cliente_id: z.number().int().positive(), status: z.enum(['aberta', 'paga']).optional() },
      outputSchema: { faturas: z.array(Fatura), total: z.number() },
      annotations: { readOnlyHint: true },
    },
    async ({ cliente_id, status }) => {
      const { rows } = await pool.query(
        'SELECT id, cliente_id, valor, vencimento, status FROM faturas WHERE cliente_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY vencimento',
        [cliente_id, status ?? null],
      );
      const faturas = rows.map(linhaFatura);
      const total = Math.round(faturas.reduce((s, f) => s + f.valor, 0) * 100) / 100;
      return ok({ faturas, total });
    },
  );

  server.registerTool(
    'registrar_pagamento',
    {
      title: 'Registrar pagamento',
      description: 'Marca uma fatura aberta como paga.',
      inputSchema: { fatura_id: z.number().int().positive() },
      // Escrita: não é readOnly; é idempotente (pagar duas vezes não muda nada).
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ fatura_id }) => {
      const { rows } = await pool.query("UPDATE faturas SET status = 'paga' WHERE id = $1 RETURNING id, cliente_id, valor, vencimento, status", [fatura_id]);
      if (rows.length === 0) return erro(`Fatura ${fatura_id} não existe.`);
      return ok({ fatura: linhaFatura(rows[0]) });
    },
  );

  // Resource template: a ficha do cliente como documento que o app pode anexar ao contexto.
  server.registerResource(
    'ficha_cliente',
    new ResourceTemplate('crm://clientes/{id}', {
      list: async () => {
        const { rows } = await pool.query('SELECT id, nome FROM clientes ORDER BY id');
        return { resources: rows.map((r) => ({ uri: `crm://clientes/${r.id}`, name: r.nome })) };
      },
    }),
    { title: 'Ficha do cliente', mimeType: 'application/json' },
    async (uri, { id }) => {
      const { rows } = await pool.query('SELECT id, nome, email, plano FROM clientes WHERE id = $1', [Number(id)]);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(rows[0] ?? null) }] };
    },
  );

  server.registerPrompt(
    'cobranca_amigavel',
    { title: 'Cobrança amigável', description: 'Rascunho de e-mail de cobrança', argsSchema: { cliente: z.string() } },
    ({ cliente }) => ({
      messages: [{
        role: 'user',
        content: { type: 'text', text: `Use as tools do CRM para achar as faturas abertas de "${cliente}" e escreva um e-mail curto e cordial de cobrança.` },
      }],
    }),
  );

  return server;
}
