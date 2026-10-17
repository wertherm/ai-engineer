// Agente que CRIA, EXECUTA e AJUSTA tarefas usando três tipos de ferramenta externa:
//   - banco de dados (Postgres m04.tarefas)        -> criar_tarefa, atualizar_tarefa
//   - API REST (HTTP local na porta 30400)         -> consultar_cotacao
//   - servidor MCP (stdio, descoberto em runtime)   -> notificar_time
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { chat, criarPool, config, resumoUso } from '../../comum/llm.js';
import { subirApi } from './api-rest.js';

const PORTA = Number(process.env.PORTA_API ?? 30400);
const pool = await criarPool();
await pool.query(`
  DROP TABLE IF EXISTS m04.tarefas, m04.notificacoes;
  CREATE TABLE m04.tarefas (id serial PRIMARY KEY, titulo text NOT NULL, status text NOT NULL DEFAULT 'aberta',
    prioridade text NOT NULL DEFAULT 'normal', resultado text);
  CREATE TABLE m04.notificacoes (id serial PRIMARY KEY, time text, mensagem text, criada_em timestamptz DEFAULT now());`);
const api = await subirApi(PORTA);

const mcp = new Client({ name: 'agente-tarefas', version: '1.0.0' });
await mcp.connect(new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./mcp-automacoes.js', import.meta.url))],
  env: { ...getDefaultEnvironment(), DATABASE_URL: config.databaseUrl },
  stderr: 'inherit',
}));

// Ferramentas locais: schema JSON escrito à mão (descrições curtas e enums = menos erro do modelo).
const locais = {
  criar_tarefa: {
    description: 'Cria uma tarefa e devolve o id.',
    parameters: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'], additionalProperties: false },
    run: async ({ titulo }) => (await pool.query('INSERT INTO m04.tarefas (titulo) VALUES ($1) RETURNING id, status', [titulo])).rows[0],
  },
  atualizar_tarefa: {
    description: 'Ajusta prioridade, status e/ou resultado de uma tarefa.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta'] },
        status: { type: 'string', enum: ['aberta', 'concluida'] },
        resultado: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async ({ id, prioridade, status, resultado }) => (await pool.query(
      `UPDATE m04.tarefas SET prioridade = COALESCE($2, prioridade), status = COALESCE($3, status),
       resultado = COALESCE($4, resultado) WHERE id = $1 RETURNING *`, [id, prioridade, status, resultado])).rows[0]
      ?? { erro: `tarefa ${id} não existe` },
  },
  consultar_cotacao: {
    description: 'Cotação atual de uma moeda em reais (API REST).',
    parameters: { type: 'object', properties: { moeda: { type: 'string', enum: ['USD', 'EUR'] } }, required: ['moeda'], additionalProperties: false },
    run: async ({ moeda }) => (await fetch(`http://127.0.0.1:${PORTA}/cotacao/${moeda}`)).json(),
  },
};

// Ferramentas do MCP: o inputSchema já é JSON Schema; só reembalamos no formato da API OpenAI.
const { tools: toolsMcp } = await mcp.listTools();
const schemas = [
  ...Object.entries(locais).map(([name, t]) => ({ type: 'function', function: { name, description: t.description, parameters: t.parameters } })),
  ...toolsMcp.map(({ name, description, inputSchema: { $schema, ...parameters } }) => ({ type: 'function', function: { name, description, parameters } })),
];
console.log('Ferramentas:', schemas.map((s) => s.function.name).join(', '));

async function executar(nome, args) {
  if (locais[nome]) return locais[nome].run(args);
  const r = await mcp.callTool({ name: nome, arguments: args }); // roteia para o servidor MCP
  return { mcp: true, isError: r.isError ?? false, texto: r.content.map((c) => c.text).join('') };
}

const tarefa = 'Crie a tarefa "Monitorar dólar" e consulte a cotação do USD. Se passar de 5,30, ' +
  'ajuste a tarefa para prioridade alta e notifique o time financeiro. Por fim conclua a tarefa com a cotação como resultado.';
console.log('Pedido:', tarefa);
const msgs = [
  { role: 'system', content: 'Você é um agente de operações. Execute o pedido usando as ferramentas, um passo de cada vez. Responda em uma frase no fim.' },
  { role: 'user', content: tarefa },
];

try {
  for (let passo = 1; passo <= 8; passo++) {
    const { msg, ms } = await chat(msgs, { tools: schemas, maxTokens: 150 });
    msgs.push(msg);
    if (!msg.tool_calls?.length) { console.log(`\n[${passo}] resposta final (${(ms / 1000).toFixed(0)}s): ${msg.content}`); break; }
    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}');
      let r;
      try { r = await executar(call.function.name, args); } catch (e) { r = { erro: e.message }; }
      console.log(`[${passo}] (${(ms / 1000).toFixed(0)}s) ${call.function.name}(${JSON.stringify(args)}) -> ${JSON.stringify(r)}`);
      msgs.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(r) });
    }
  }
  console.log('\nEstado final no banco:');
  console.table((await pool.query('SELECT id, titulo, status, prioridade, resultado FROM m04.tarefas')).rows);
  console.table((await pool.query('SELECT id, time, mensagem FROM m04.notificacoes')).rows);
  console.log(resumoUso());
} finally {
  await mcp.close();
  api.close();
  await pool.end();
}
