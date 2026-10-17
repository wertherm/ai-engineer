// Plan-and-Execute (variante ReWOO): 1) o PLANNER (LLM) escreve o plano inteiro de uma vez, com
// referências a resultados futuros (#E1, #E2...); 2) o EXECUTOR (código determinístico) roda os
// passos sem chamar o LLM; 3) o SOLVER entrega o valor do último passo. No ReWOO original o solver é
// outro LLM; aqui é código, porque um modelo pequeno às vezes "reescreve" o número das evidências.
// Se o plano falhar, há 1 replanejamento com o erro como feedback.
import { chat, extrairJson } from '../../comum/llm.js';
import { ferramentas, executarFerramenta } from './ferramentas.js';

const catalogo = Object.entries(ferramentas)
  .map(([n, f]) => `- ${n}(${Object.keys(f.parameters.properties).join(', ')}): ${f.description}`).join('\n');

const PROMPT_PLANNER = `Você é um planejador. Ferramentas:\n${catalogo}\n` +
  'Devolva SÓ JSON {"passos":[{"id":"E1","tool":"...","args":{...}}]}. ' +
  'Em calcular, use #E1, #E2... para citar o valor de passos anteriores. O último passo é um calcular com a resposta. ' +
  // One-shot: um exemplo de plano ensina o formato e o uso de #En melhor que qualquer regra.
  'Exemplo para "custo de completar teclado até 50": {"passos":[{"id":"E1","tool":"consultar_estoque","args":{"produto":"teclado"}},' +
  '{"id":"E2","tool":"consultar_preco","args":{"produto":"teclado"}},{"id":"E3","tool":"calcular","args":{"expressao":"(50-#E1)*#E2"}}]}';

function executarPlano(plano, log) {
  const evid = {};
  for (const p of plano) {
    // Substitui #En pelo valor já calculado (por isso o executor não precisa de LLM).
    const args = JSON.parse(JSON.stringify(p.args ?? {}).replace(/#(E\d+)/g, (_, id) => {
      if (!(id in evid)) throw new Error(`${p.id} referencia ${id}, que ainda não existe`);
      return evid[id];
    }));
    const r = executarFerramenta(p.tool, args);
    if (r.erro) throw new Error(`${p.id} ${p.tool}: ${r.erro}`);
    evid[p.id] = r.valor;
    log(`  executor ${p.id}: ${p.tool}(${JSON.stringify(args)}) = ${r.valor}`);
  }
  return evid;
}

export async function planExecute(tarefa, { log = console.log } = {}) {
  let llmCalls = 0;
  let feedback = '';
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const { msg, ms } = await chat([
      { role: 'system', content: PROMPT_PLANNER },
      { role: 'user', content: tarefa + feedback },
    ], { maxTokens: 300, json: true });
    llmCalls += 1;
    try {
      const { passos: plano } = extrairJson(msg.content);
      log(`  planner (${(ms / 1000).toFixed(0)}s, tentativa ${tentativa}): ${plano.length} passos`);
      const evid = executarPlano(plano, log);
      const ultimo = plano.at(-1).id;
      return { resposta: `Resposta: R$ ${evid[ultimo]}`, llmCalls, chamadasTool: plano.length, plano };
    } catch (e) {
      log(`  plano falhou: ${e.message}\n  saída do planner: ${msg.content.slice(0, 300)}\n  -> replanejando`);
      feedback = `\nSeu plano anterior falhou: ${e.message}. Corrija.`;
    }
  }
  return { resposta: null, llmCalls, chamadasTool: 0 };
}
