// Servidor MCP mínimo via stdio: 2 tools, 1 resource fixo, 1 resource template e 1 prompt.
// IMPORTANTE: em stdio, o stdout é o canal JSON-RPC. Qualquer console.log quebra o protocolo,
// por isso logs vão para o stderr (console.error).
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'ola-mcp', version: '1.0.0' });

// Tool: ação que o modelo pode pedir. O schema zod vira JSON Schema no tools/list
// e o SDK valida os argumentos antes de chamar o handler.
server.registerTool(
  'somar',
  {
    title: 'Somar',
    description: 'Soma dois números',
    inputSchema: { a: z.number(), b: z.number() },
    outputSchema: { resultado: z.number() },
    annotations: { readOnlyHint: true },
  },
  async ({ a, b }) => {
    const resultado = a + b;
    // content = texto para o modelo; structuredContent = JSON tipado (validado contra outputSchema)
    return { content: [{ type: 'text', text: String(resultado) }], structuredContent: { resultado } };
  },
);

server.registerTool(
  'dia_da_semana',
  {
    title: 'Dia da semana',
    description: 'Diz o dia da semana de uma data ISO (AAAA-MM-DD)',
    inputSchema: { data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) },
  },
  async ({ data }) => {
    const dia = new Date(`${data}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });
    return { content: [{ type: 'text', text: `${data} cai numa ${dia}` }] };
  },
);

// Resource fixo: dado somente leitura, escolhido pela aplicação/usuário (não pelo modelo).
server.registerResource(
  'sobre',
  'info://sobre',
  { title: 'Sobre o servidor', description: 'Metadados do servidor', mimeType: 'application/json' },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ empresa: 'Exemplo SA', versao: '1.0.0' }) }],
  }),
);

// Resource template: URI com variável ({nome}); list: undefined = não enumera instâncias.
server.registerResource(
  'saudacao',
  new ResourceTemplate('saudacao://{nome}', { list: undefined }),
  { title: 'Saudação', description: 'Saudação personalizada' },
  async (uri, { nome }) => ({ contents: [{ uri: uri.href, text: `Olá, ${nome}! Bem-vindo ao MCP.` }] }),
);

// Prompt: template reutilizável que o usuário escolhe (ex.: slash command no client).
server.registerPrompt(
  'revisar_codigo',
  { title: 'Revisar código', description: 'Pede uma revisão de código', argsSchema: { codigo: z.string() } },
  ({ codigo }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `Revise este código e aponte bugs:\n\n${codigo}` } }],
  }),
);

await server.connect(new StdioServerTransport());
console.error('[ola-mcp] servidor pronto no stdio');
