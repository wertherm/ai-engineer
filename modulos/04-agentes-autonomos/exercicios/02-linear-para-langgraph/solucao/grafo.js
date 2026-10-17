// SOLUÇÃO do exercício 02: o mesmo agente como grafo LangGraph.
// extrair -> validar -> calcular_frete (retry 3x) -> responder
//                  \-> fallback (dados inválidos)   \-> frete_padrao (API fora do ar)
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { chat, extrairJson } from '../../../comum/llm.js';
import { apiFrete } from '../inicial/linear.js';

const FRETE_PADRAO = 50;

const Estado = Annotation.Root({
  pedido: Annotation(),
  dados: Annotation(),
  erro: Annotation(),
  frete: Annotation(),
  origemFrete: Annotation(),
  resposta: Annotation(),
  trilha: Annotation({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

export function criarGrafo({ apiFalhando = false } = {}) {
  let tentativas = 0;

  const extrair = async (s) => {
    const { msg } = await chat([
      { role: 'system', content: 'Extraia do pedido. Devolva só JSON {"produto":"...","quantidade":n,"cep":"somente dígitos"}.' },
      { role: 'user', content: s.pedido },
    ], { maxTokens: 50 });
    try { return { dados: extrairJson(msg.content), trilha: ['extrair'] }; } catch (e) { return { erro: e.message, trilha: ['extrair'] }; }
  };

  // Validação determinística: não confie cegamente na saída do LLM.
  const validar = (s) => {
    const d = s.dados ?? {};
    const cep = String(d.cep ?? '').replace(/\D/g, '');
    const erro = s.erro ?? (cep.length !== 8 ? 'CEP inválido' : !(d.quantidade > 0) ? 'quantidade inválida' : null);
    return { erro, dados: { ...d, cep }, trilha: [`validar${erro ? `(${erro})` : ''}`] };
  };

  // Nó com retryPolicy: tenta 3x. Se ainda falhar, NÃO derruba o grafo: devolve a falha no estado
  // para o roteador mandar ao fallback. (Só a última tentativa captura o erro.)
  const calcularFrete = async (s) => {
    tentativas += 1;
    try {
      return { frete: await apiFrete(s.dados.cep, { falhar: apiFalhando }), origemFrete: 'api', trilha: [`calcular_frete#${tentativas}`] };
    } catch (e) {
      if (tentativas < 3) throw e; // relança: o retryPolicy tenta de novo
      return { erro: `API de frete: ${e.message}`, trilha: [`calcular_frete#${tentativas}(falhou)`] };
    }
  };

  const fretePadrao = () => ({ frete: FRETE_PADRAO, origemFrete: 'tabela padrão (fallback)', trilha: ['frete_padrao'] });
  const responder = (s) => ({ resposta: `${s.dados.quantidade}x ${s.dados.produto}, frete R$ ${s.frete} (${s.origemFrete})`, trilha: ['responder'] });
  const fallback = (s) => ({ resposta: `Não consegui entender o pedido (${s.erro}). Um atendente vai assumir.`, trilha: ['fallback'] });

  return new StateGraph(Estado)
    .addNode('extrair', extrair)
    .addNode('validar', validar)
    .addNode('calcular_frete', calcularFrete, { retryPolicy: { maxAttempts: 3, initialInterval: 100, jitter: false, logWarning: false } })
    .addNode('frete_padrao', fretePadrao)
    .addNode('responder', responder)
    .addNode('fallback', fallback)
    .addEdge(START, 'extrair')
    .addEdge('extrair', 'validar')
    .addConditionalEdges('validar', (s) => (s.erro ? 'fallback' : 'calcular_frete'), ['fallback', 'calcular_frete'])
    .addConditionalEdges('calcular_frete', (s) => (s.erro ? 'frete_padrao' : 'responder'), ['frete_padrao', 'responder'])
    .addEdge('frete_padrao', 'responder')
    .addEdge('responder', END)
    .addEdge('fallback', END)
    .compile();
}
