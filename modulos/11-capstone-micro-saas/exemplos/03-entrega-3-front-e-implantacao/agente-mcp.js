// Demonstração da Entrega 3: um agente EXTERNO usando o Micro-SaaS implantado só pelo protocolo MCP
// (como faria o Claude, uma IDE ou o copiloto interno de um cliente). Ele não conhece o banco nem a API
// REST: descobre as tools com tools/list e decide quais chamar. Padrão do módulo 03 (exemplo 03).
// Pré-requisito: npm run e3:subir. Rode: npm run e3:agente [-- "pergunta"]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { criarLlm } from '../../app/src/llm.js';

const URL_MCP = new URL(process.env.URL_MCP ?? 'http://127.0.0.1:31180/mcp');
const CHAVE = process.env.API_KEY ?? 'sk-padaria-demo';
const pergunta = process.argv[2] ?? 'Vou faltar amanhã no turno da madrugada por doença: até quando aviso a gerência e o que preciso entregar depois?';

const mcp = new Client({ name: 'agente-externo', version: '1.0.0' });
await mcp.connect(new StreamableHTTPClientTransport(URL_MCP, { requestInit: { headers: { authorization: `Bearer ${CHAVE}` } } }));

// Só as tools de leitura RÁPIDAS: o agente já tem o próprio LLM; chamar `perguntar` (que usa o LLM do
// servidor) dobraria custo e latência. Decisão registrada na ADR-005 (docs/04).
const { tools } = await mcp.listTools();
const usadas = tools.filter((t) => t.name !== 'perguntar');
const openaiTools = usadas.map(({ name, description, inputSchema }) => {
  const { $schema, ...parameters } = inputSchema; // alguns provedores recusam "$schema" em parameters
  return { type: 'function', function: { name, description, parameters } };
});
console.log(`MCP em ${URL_MCP.href} · tools descobertas: ${tools.map((t) => t.name).join(', ')}`);
console.log(`tools entregues ao LLM: ${usadas.map((t) => t.name).join(', ')}\nPergunta: ${pergunta}`);

const llm = criarLlm();
const messages = [
  { role: 'system', content: `${mcp.getInstructions()} Busque antes de responder. Responda em português, em até 3 frases, citando o arquivo entre colchetes.` },
  { role: 'user', content: pergunta },
];
for (let passo = 1; passo <= 4; passo++) {
  const { msg, ms } = await llm.chat(messages, { tools: passo < 4 ? openaiTools : undefined, maxTokens: 200 });
  messages.push(msg);
  if (!msg.tool_calls?.length) {
    console.log(`\n[passo ${passo}, ${(ms / 1000).toFixed(1)}s] resposta final:\n${msg.content}`);
    break;
  }
  for (const call of msg.tool_calls) {
    const args = JSON.parse(call.function.arguments || '{}');
    console.log(`\n[passo ${passo}, ${(ms / 1000).toFixed(1)}s] agente chamou ${call.function.name}(${JSON.stringify(args)})`);
    const r = await mcp.callTool({ name: call.function.name, arguments: args }); // quem executa é o servidor MCP
    const texto = r.content.map((c) => c.text ?? '').join('\n');
    console.log(`  resultado${r.isError ? ' [ERRO]' : ''}: ${texto.slice(0, 160)}...`);
    messages.push({ role: 'tool', tool_call_id: call.id, content: texto });
  }
}
await mcp.close();
