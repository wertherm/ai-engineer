// Agent loop do zero, sem framework: percepção -> raciocínio -> ação -> feedback, até o modelo
// responder sem pedir ferramenta (objetivo atingido) ou estourar o limite de passos.
import { chat } from '../../comum/llm.js';
import { ferramentas, validarArgs } from './ferramentas.js';

export async function executarAgente(tarefa, { maxPassos = 5, log = console.log } = {}) {
  // Memory store (curto prazo): o histórico da conversa É o estado do agente.
  const memoria = [
    { role: 'system', content: 'Você é um agente de operações. Use as ferramentas para obter dados e para toda conta; nunca invente números nem calcule de cabeça. Responda em português, em uma frase.' },
    { role: 'user', content: tarefa },
  ];
  const toolbox = Object.values(ferramentas).map((f) => f.schema);

  for (let passo = 1; passo <= maxPassos; passo++) {
    // 1) PERCEPÇÃO: o que o agente "enxerga" agora = tarefa + resultados anteriores.
    log(`\n── passo ${passo} ──`);
    log(`[percepção] ${memoria.length} mensagens no contexto (última: ${memoria.at(-1).role})`);

    // 2) RACIOCÍNIO: o LLM decide o próximo passo (chamar tool ou responder).
    const { msg, ms, usage } = await chat(memoria, { tools: toolbox, maxTokens: 150 });
    memoria.push(msg);
    log(`[raciocínio] ${(ms / 1000).toFixed(1)}s, ${usage.prompt_tokens}+${usage.completion_tokens} tokens`);

    if (!msg.tool_calls?.length) {
      log(`[fim] objetivo atingido: ${msg.content}`);
      return { resposta: msg.content, passos: passo };
    }

    for (const call of msg.tool_calls) {
      // 3) AÇÃO: o executor valida e roda o pedido do modelo.
      let resultado;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        const ferramenta = ferramentas[call.function.name];
        const erro = ferramenta ? validarArgs(ferramenta.schema, args) : `ferramenta inexistente: ${call.function.name}`;
        log(`[ação] ${call.function.name}(${JSON.stringify(args)})`);
        resultado = erro ? { erro } : await ferramenta.handler(args);
      } catch (e) {
        resultado = { erro: e.message };
      }
      // 4) FEEDBACK: o resultado (ou o erro!) volta ao contexto e alimenta o próximo raciocínio.
      log(`[feedback] ${JSON.stringify(resultado)}`);
      memoria.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(resultado) });
    }
  }
  log('[fim] limite de passos atingido sem resposta final');
  return { resposta: null, passos: maxPassos };
}
