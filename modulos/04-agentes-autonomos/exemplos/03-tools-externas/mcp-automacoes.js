// Servidor MCP (stdio) de "automações": expõe a tool notificar_time, que grava a notificação no
// Postgres (schema m04). Mesmo padrão do módulo 03; aqui o foco é o AGENTE consumindo o MCP.
// Lembrete: em stdio o stdout é o canal JSON-RPC, então nada de console.log aqui.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { criarPool } from '../../comum/llm.js';

const pool = await criarPool();
const server = new McpServer({ name: 'automacoes', version: '1.0.0' });

server.registerTool(
  'notificar_time',
  {
    description: 'Envia uma notificação a um time (financeiro, compras ou ti).',
    inputSchema: { time: z.enum(['financeiro', 'compras', 'ti']), mensagem: z.string().max(200) },
  },
  async ({ time, mensagem }) => {
    const { rows } = await pool.query(
      'INSERT INTO m04.notificacoes (time, mensagem) VALUES ($1, $2) RETURNING id', [time, mensagem]);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, id: rows[0].id, time }) }] };
  },
);

await server.connect(new StdioServerTransport());
