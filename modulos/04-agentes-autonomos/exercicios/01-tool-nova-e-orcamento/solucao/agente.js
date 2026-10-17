// SOLUÇÃO do exercício 01: o agent loop do exemplo 01 + (a) uma tool nova e (b) um guardrail
// de orçamento (máximo de chamadas ao LLM e de tokens) checado ANTES de cada chamada.
import { chat } from '../../../comum/llm.js';
import { ferramentas as base, validarArgs } from '../../../exemplos/01-agent-loop-do-zero/ferramentas.js';

// (a) Tool nova: mesmo formato das outras (schema JSON + handler). Nada no loop muda.
const precos = { teclado: 120, mouse: 50, monitor: 900 };
export const ferramentas = {
  ...base,
  consultar_preco: {
    schema: {
      type: 'function',
      function: {
        name: 'consultar_preco',
        description: 'Preço unitário (R$) de um produto.',
        parameters: {
          type: 'object',
          properties: { produto: { type: 'string', enum: Object.keys(precos) } },
          required: ['produto'],
          additionalProperties: false,
        },
      },
    },
    handler: ({ produto }) => ({ produto, preco: precos[produto] }),
  },
};

export class OrcamentoEstourado extends Error {}

export async function executarAgente(tarefa, { maxPassos = 6, orcamento = { chamadas: 4, tokens: 3000 }, log = console.log } = {}) {
  const gasto = { chamadas: 0, tokens: 0 };
  const memoria = [
    { role: 'system', content: 'Você é um agente de operações. Use as ferramentas para obter dados e para toda conta; nunca invente números. Responda em português, em uma frase.' },
    { role: 'user', content: tarefa },
  ];
  const toolbox = Object.values(ferramentas).map((f) => f.schema);

  for (let passo = 1; passo <= maxPassos; passo++) {
    // (b) Guardrail: checa ANTES de gastar. Depois de gasto, já era.
    if (gasto.chamadas >= orcamento.chamadas || gasto.tokens >= orcamento.tokens) {
      log(`[guardrail] orçamento estourado: ${JSON.stringify(gasto)} (limite ${JSON.stringify(orcamento)})`);
      return { resposta: null, motivo: 'orcamento', gasto };
    }
    const { msg, usage } = await chat(memoria, { tools: toolbox, maxTokens: 150 });
    gasto.chamadas += 1;
    gasto.tokens += usage.total_tokens;
    memoria.push(msg);
    log(`[passo ${passo}] gasto até aqui: ${gasto.chamadas} chamadas, ${gasto.tokens} tokens`);
    if (!msg.tool_calls?.length) return { resposta: msg.content, motivo: 'ok', gasto };

    for (const call of msg.tool_calls) {
      let resultado;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        const f = ferramentas[call.function.name];
        const erro = f ? validarArgs(f.schema, args) : `ferramenta inexistente: ${call.function.name}`;
        resultado = erro ? { erro } : await f.handler(args);
        log(`  ${call.function.name}(${JSON.stringify(args)}) -> ${JSON.stringify(resultado)}`);
      } catch (e) {
        resultado = { erro: e.message };
      }
      memoria.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(resultado) });
    }
  }
  return { resposta: null, motivo: 'max_passos', gasto };
}
