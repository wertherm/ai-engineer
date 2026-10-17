// O mesmo ReAct, agora com o framework: createAgent (LangChain v1) monta um grafo LangGraph
// "modelo -> tools -> modelo" por baixo. Menos código, mesmo padrão.
import { createAgent, tool } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { config, extrasOllama } from '../../comum/llm.js';
import { ferramentas, TAREFA, RESPOSTA_CERTA } from './ferramentas.js';

const model = new ChatOpenAI({
  model: config.modeloChat,
  temperature: 0,
  maxTokens: 250,
  apiKey: config.apiKey,
  configuration: { baseURL: config.baseURL },
  modelKwargs: extrasOllama, // repassa reasoning_effort: "none" ao Ollama
});

const produto = z.object({ produto: z.enum(['teclado', 'mouse', 'monitor']) });
const tools = [
  tool(({ produto: p }) => JSON.stringify(ferramentas.consultar_estoque.handler({ produto: p })),
    { name: 'consultar_estoque', description: ferramentas.consultar_estoque.description, schema: produto }),
  tool(({ produto: p }) => JSON.stringify(ferramentas.consultar_preco.handler({ produto: p })),
    { name: 'consultar_preco', description: ferramentas.consultar_preco.description, schema: produto }),
  tool(({ expressao }) => JSON.stringify(ferramentas.calcular.handler({ expressao })),
    { name: 'calcular', description: ferramentas.calcular.description, schema: z.object({ expressao: z.string() }) }),
];

export async function reactLangChain(tarefa, { log = console.log } = {}) {
  const agent = createAgent({
    model,
    tools,
    systemPrompt: 'Use as ferramentas para todo dado e conta. No fim responda só "Resposta: <valor>".',
  });
  const out = await agent.invoke({ messages: [{ role: 'user', content: tarefa }] }, { recursionLimit: 20 });
  let llmCalls = 0;
  let chamadasTool = 0;
  for (const m of out.messages) {
    if (m.type === 'ai') llmCalls += 1;
    if (m.type === 'tool') { chamadasTool += 1; log(`  tool ${m.name} -> ${m.content}`); }
  }
  return { resposta: out.messages.at(-1).content, llmCalls, chamadasTool };
}

// Rodando direto (npm run ex02:langchain): mesma tarefa e mesmas métricas do main.js.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`Tarefa: ${TAREFA}\nResposta certa: ${RESPOSTA_CERTA}\n\n=== ReAct (LangChain createAgent) ===`);
  const t0 = Date.now();
  const r = await reactLangChain(TAREFA);
  const acertou = String(r.resposta).replace(/[.\s]/g, '').includes(String(RESPOSTA_CERTA));
  console.log(`  resposta: ${String(r.resposta).trim()}`);
  console.table([{ estrategia: 'ReAct (LangChain)', llmCalls: r.llmCalls, chamadasTool: r.chamadasTool, segundos: ((Date.now() - t0) / 1000).toFixed(1), acertou }]);
}
