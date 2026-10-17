// ReAct: o modelo intercala Pensamento (reasoning trace) e Ação (tool call), observa o resultado
// e decide o próximo passo. Um LLM call por iteração: flexível, mas paga o contexto inteiro a cada volta.
import { chat } from '../../comum/llm.js';
import { schemasOpenAI, executarFerramenta } from './ferramentas.js';

export async function react(tarefa, { maxPassos = 8, log = console.log } = {}) {
  const msgs = [
    { role: 'system', content: 'Resolva a tarefa passo a passo. Antes de cada ação escreva "Pensamento: <uma linha>". Use as ferramentas para todo dado e conta. No fim responda "Resposta: <valor>".' },
    { role: 'user', content: tarefa },
  ];
  let chamadasTool = 0;
  for (let passo = 1; passo <= maxPassos; passo++) {
    const { msg, ms } = await chat(msgs, { tools: schemasOpenAI, maxTokens: 150 });
    msgs.push(msg);
    if (msg.content?.trim()) log(`  [${passo}] ${msg.content.trim().replace(/\n+/g, ' | ')} (${(ms / 1000).toFixed(0)}s)`);
    if (!msg.tool_calls?.length) return { resposta: msg.content, llmCalls: passo, chamadasTool };
    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}');
      const obs = executarFerramenta(call.function.name, args);
      chamadasTool += 1;
      log(`  [${passo}] Ação: ${call.function.name}(${JSON.stringify(args)}) -> Observação: ${JSON.stringify(obs)}`);
      msgs.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(obs) });
    }
  }
  return { resposta: null, llmCalls: maxPassos, chamadasTool };
}
