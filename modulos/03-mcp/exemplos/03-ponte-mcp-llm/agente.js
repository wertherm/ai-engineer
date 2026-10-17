// Ponte MCP -> LLM: o client MCP descobre as tools, converte para o formato de tools da API
// OpenAI (Chat Completions) e deixa o modelo decidir quais chamar, num loop de tool calling.
// Funciona com Ollama (padrão) ou com qualquer API compatível (OpenAI, OpenRouter) via variáveis de ambiente.
import OpenAI from 'openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { criarPool, resetarBanco, DATABASE_URL } from '../02-empresa-como-mcp/db.js';

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.OPENAI_API_KEY ?? 'ollama',
});
const MODELO = process.env.MODELO_CHAT ?? 'qwen3.5:4b';
const pergunta = process.argv[2] ?? 'Quanto a Padaria Pão Quente deve no total em faturas abertas?';

// Banco com os dados de demonstração.
const pool = criarPool();
await resetarBanco(pool);
await pool.end();

const mcp = new Client({ name: 'ponte-llm', version: '1.0.0' });
await mcp.connect(new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../02-empresa-como-mcp/server.js', import.meta.url))],
  env: { ...getDefaultEnvironment(), DATABASE_URL },
  stderr: 'ignore',
}));

// O inputSchema do MCP já é JSON Schema: é só reembalar. Removemos "$schema" porque alguns
// provedores recusam chaves de meta-schema dentro de "parameters".
function mcpParaOpenAI(tools) {
  return tools.map(({ name, description, inputSchema }) => {
    const { $schema, ...parameters } = inputSchema;
    return { type: 'function', function: { name, description, parameters } };
  });
}

const { tools } = await mcp.listTools();
const openaiTools = mcpParaOpenAI(tools);
console.log('Tools enviadas ao modelo:', openaiTools.map((t) => t.function.name).join(', '));
console.log('Pergunta:', pergunta);

const messages = [
  { role: 'system', content: `${mcp.getInstructions()} Responda em português, em uma frase, usando só dados das tools.` },
  { role: 'user', content: pergunta },
];

for (let passo = 1; passo <= 6; passo++) {
  const t0 = Date.now();
  const resp = await openai.chat.completions.create({
    model: MODELO,
    messages,
    tools: openaiTools,
    temperature: 0,
    max_tokens: 300,
    reasoning_effort: 'none', // desliga o "thinking" do qwen3.5 no Ollama (bem mais rápido em CPU)
  });
  const msg = resp.choices[0].message;
  messages.push(msg);
  const segundos = ((Date.now() - t0) / 1000).toFixed(1);

  if (!msg.tool_calls?.length) {
    console.log(`\n[passo ${passo}, ${segundos}s] Resposta final: ${msg.content}`);
    break;
  }
  for (const call of msg.tool_calls) {
    const args = JSON.parse(call.function.arguments || '{}');
    console.log(`\n[passo ${passo}, ${segundos}s] modelo chamou ${call.function.name}(${JSON.stringify(args)})`);
    // Quem executa é o client MCP; o modelo só pediu.
    const r = await mcp.callTool({ name: call.function.name, arguments: args });
    const texto = r.content.map((c) => c.text ?? '').join('\n');
    console.log(`  resultado${r.isError ? ' [ERRO]' : ''}: ${texto.slice(0, 200)}`);
    messages.push({ role: 'tool', tool_call_id: call.id, content: texto });
  }
}

await mcp.close();
