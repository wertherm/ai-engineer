// Compara ReAct x Plan-and-Execute na MESMA tarefa e imprime passos, chamadas e tempo reais.
// O ReAct com LangChain (createAgent) roda à parte: npm run ex02:langchain.
import { react } from './react.js';
import { planExecute } from './plan-execute.js';
import { uso } from '../../comum/llm.js';
import { TAREFA, RESPOSTA_CERTA } from './ferramentas.js';

const estrategias = [['ReAct (manual)', react], ['Plan-and-Execute', planExecute]];

console.log(`Tarefa: ${TAREFA}\nResposta certa: ${RESPOSTA_CERTA}`);
const linhas = [];
for (const [nome, fn] of estrategias) {
  console.log(`\n=== ${nome} ===`);
  const t0 = Date.now();
  const tok0 = uso.promptTokens + uso.completionTokens;
  const r = await fn(TAREFA);
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  const acertou = String(r.resposta ?? '').replace(/[.\s]/g, '').includes(String(RESPOSTA_CERTA));
  console.log(`  resposta: ${String(r.resposta).trim()}`);
  const tokens = uso.promptTokens + uso.completionTokens - tok0;
  linhas.push({ estrategia: nome, llmCalls: r.llmCalls, chamadasTool: r.chamadasTool, tokens, segundos: s, acertou });
}
console.log('\nComparativo:');
console.table(linhas);
