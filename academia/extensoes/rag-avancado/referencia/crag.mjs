// Núcleo de controle de um RAG corretivo (no espírito do CRAG). Sem dependências e sem LLM embutido: recuperar, avaliar,
// reescrever, gerar e a busca externa são FUNÇÕES injetadas. Assim o fluxo é testável com funções simuladas e plugável
// nas suas implementações reais (pgvector, reranker, LLM-juiz, busca na web com lista de permissão).
//
// Fluxo:  recuperar -> avaliar cada trecho -> classificar a recuperação
//   correta    (algum trecho >= limiares.correto)     : usa só os trechos bons e gera a resposta
//   ambígua    (entre os limiares)                    : usa os trechos razoáveis + complementa (busca externa ou reescrita)
//   incorreta  (todos < limiares.incorreto)           : reescreve a consulta e recupera de novo; se continuar ruim, ABSTÉM-SE
// Princípios: o gerador NUNCA recebe trecho abaixo do limiar mínimo; sem evidência suficiente a resposta é abstenção, não palpite.

/**
 * @param {object} p
 * @param {string} p.pergunta
 * @param {(consulta: string) => Promise<{id: string, texto: string}[]>} p.recuperar
 * @param {(pergunta: string, docs: object[]) => Promise<{id: string, nota: number}[]>} p.avaliar nota de 0 a 1 por trecho
 * @param {(pergunta: string, tentativa: number) => Promise<string>} [p.reescrever] gera uma consulta melhor
 * @param {(consulta: string) => Promise<{id: string, texto: string}[]>} [p.buscaExterna] fonte complementar (use lista de permissão!)
 * @param {(pergunta: string, docs: object[]) => Promise<string>} p.gerar
 * @param {{correto?: number, incorreto?: number}} [p.limiares]
 * @param {number} [p.maxReescritas]
 */
export async function responderComCorrecao({ pergunta, recuperar, avaliar, reescrever, buscaExterna, gerar, limiares = {}, maxReescritas = 1 }) {
  const lim = { correto: 0.7, incorreto: 0.3, ...limiares };
  if (!(lim.incorreto >= 0 && lim.incorreto < lim.correto && lim.correto <= 1)) throw new Error('limiares inválidos: 0 <= incorreto < correto <= 1');
  const passos = [];
  let chamadas = 0;
  const contar = async (fn, ...a) => { chamadas += 1; return fn(...a); };

  async function avaliarEClassificar(consulta, docs) {
    const notas = docs.length ? await contar(avaliar, pergunta, docs) : [];
    const porId = new Map(notas.map((n) => [n.id, Math.min(1, Math.max(0, Number(n.nota) || 0))]));
    const pontuados = docs.map((d) => ({ ...d, nota: porId.get(d.id) ?? 0 }));
    const melhor = Math.max(0, ...pontuados.map((d) => d.nota));
    const classe = melhor >= lim.correto ? 'correta' : melhor >= lim.incorreto ? 'ambigua' : 'incorreta';
    passos.push({ passo: 'avaliacao', consulta, classe, melhor, notas: pontuados.map((d) => [d.id, d.nota]) });
    return { pontuados, classe };
  }

  let consulta = pergunta;
  let { pontuados, classe } = await avaliarEClassificar(consulta, await contar(recuperar, consulta));
  let reescritas = 0;

  while (classe === 'incorreta' && reescrever && reescritas < maxReescritas) {
    reescritas += 1;
    consulta = await contar(reescrever, pergunta, reescritas);
    passos.push({ passo: 'reescrita', tentativa: reescritas, consulta });
    ({ pontuados, classe } = await avaliarEClassificar(consulta, await contar(recuperar, consulta)));
  }

  let usados = pontuados.filter((d) => d.nota >= lim.incorreto); // nunca passa lixo ao gerador
  if (classe === 'correta') {
    usados = pontuados.filter((d) => d.nota >= lim.correto);
  } else if (classe === 'ambigua' && buscaExterna) {
    const extras = await contar(buscaExterna, consulta);
    const { pontuados: ext } = await avaliarEClassificar(`externa: ${consulta}`, extras);
    usados = [...usados, ...ext.filter((d) => d.nota >= lim.correto && !usados.some((u) => u.id === d.id))];
    passos.push({ passo: 'complemento_externo', adicionados: usados.filter((u) => ext.some((e) => e.id === u.id)).map((u) => u.id) });
  }

  if (!usados.length) {
    passos.push({ passo: 'abstencao', motivo: 'sem evidência suficiente após a avaliação' });
    return { acao: 'abstencao', resposta: null, abstencao: true, classe, docsUsados: [], passos, chamadas };
  }
  const resposta = await contar(gerar, pergunta, usados.map(({ id, texto, nota }) => ({ id, texto, nota })));
  passos.push({ passo: 'geracao', fontes: usados.map((d) => d.id) });
  return { acao: classe === 'correta' ? 'usar' : 'complementar', resposta, abstencao: false, classe, docsUsados: usados.map((d) => d.id), passos, chamadas };
}
