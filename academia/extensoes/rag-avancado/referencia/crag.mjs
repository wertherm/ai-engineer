// Núcleo de controle de um RAG corretivo, INSPIRADO no CRAG (não reimplementa o artigo: sem decompor/recompor; reescreve a consulta no caso incorreto; abstenção é um acréscimo). Sem dependências e sem LLM embutido: recuperar, avaliar,
// reescrever, gerar e a busca externa são FUNÇÕES injetadas. Assim o fluxo é testável com funções simuladas e plugável
// nas suas implementações reais (pgvector, reranker, LLM-juiz, busca na web com lista de permissão).
//
// Fluxo:  recuperar -> avaliar cada trecho -> classificar a recuperação
//   correta    (algum trecho >= limiares.correto)     : usa só os trechos bons e gera a resposta
//   ambígua    (entre os limiares)                    : usa os trechos razoáveis + complementa com a busca externa, se houver
//   incorreta  (todos < limiares.incorreto)           : reescreve a consulta e recupera de novo; se continuar ruim, ABSTÉM-SE
// Princípios: o gerador NUNCA recebe trecho abaixo do limiar mínimo (que é sempre > 0: trecho sem nota vale 0 e fica de fora);
// sem evidência suficiente a resposta é abstenção, não palpite. Tudo que vem de recuperar/buscaExterna é DADO não confiável.

export const LIMITES = { maxReescritas: 5, maxDocs: 50, maxCaracteresPorDoc: 8000 };

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);
/** Nota de 0 a 1; qualquer coisa que não seja um número finito vale 0 (um avaliador com defeito nunca "aprova" um trecho). */
const nota01 = (v) => (ehNumero(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Mantém só trechos { id: texto, texto: texto }, sem ids repetidos, até o limite, com o texto cortado. Informa quantos descartou. */
function sanear(docs, rotulo) {
  if (!Array.isArray(docs)) throw new Error(`${rotulo} deve devolver uma lista de { id, texto }`);
  const vistos = new Set();
  const bons = [];
  let descartados = 0;
  for (const d of docs) {
    if (!d || typeof d.id !== 'string' || !d.id || typeof d.texto !== 'string' || vistos.has(d.id) || bons.length >= LIMITES.maxDocs) { descartados += 1; continue; }
    vistos.add(d.id);
    bons.push({ id: d.id, texto: d.texto.slice(0, LIMITES.maxCaracteresPorDoc) });
  }
  return { bons, descartados };
}

/**
 * @param {object} p
 * @param {string} p.pergunta
 * @param {(consulta: string) => Promise<{id: string, texto: string}[]>} p.recuperar
 * @param {(pergunta: string, docs: object[]) => Promise<{id: string, nota: number}[]>} p.avaliar nota de 0 a 1 por trecho
 * @param {(pergunta: string, tentativa: number) => Promise<string>} [p.reescrever] gera uma consulta melhor
 * @param {(consulta: string) => Promise<{id: string, texto: string}[]>} [p.buscaExterna] fonte complementar (use lista de permissão!)
 * @param {(pergunta: string, docs: object[]) => Promise<string>} p.gerar
 * @param {{correto?: number, incorreto?: number}} [p.limiares] 0 < incorreto < correto <= 1
 * @param {number} [p.maxReescritas] inteiro de 0 a 5
 */
export async function responderComCorrecao({ pergunta, recuperar, avaliar, reescrever, buscaExterna, gerar, limiares = {}, maxReescritas = 1 }) {
  if (typeof pergunta !== 'string' || !pergunta.trim()) throw new Error('pergunta deve ser um texto não vazio');
  for (const [nome, f] of Object.entries({ recuperar, avaliar, gerar })) if (typeof f !== 'function') throw new Error(`${nome} deve ser uma função`);
  for (const [nome, f] of Object.entries({ reescrever, buscaExterna })) if (f !== undefined && typeof f !== 'function') throw new Error(`${nome} deve ser uma função`);
  const lim = { correto: 0.7, incorreto: 0.3, ...limiares };
  if (!(ehNumero(lim.correto) && ehNumero(lim.incorreto) && lim.incorreto > 0 && lim.incorreto < lim.correto && lim.correto <= 1)) {
    throw new Error('limiares inválidos: 0 < incorreto < correto <= 1 (o mínimo precisa ser maior que zero, senão trecho sem nota passaria)');
  }
  if (!Number.isInteger(maxReescritas) || maxReescritas < 0 || maxReescritas > LIMITES.maxReescritas) throw new Error(`maxReescritas deve ser um inteiro de 0 a ${LIMITES.maxReescritas}`);
  const passos = [];
  let chamadas = 0;
  const contar = async (fn, ...a) => { chamadas += 1; return fn(...a); };

  async function avaliarEClassificar(consulta, recuperados, rotulo) {
    const { bons: docs, descartados } = sanear(recuperados, rotulo);
    let notas = [];
    if (docs.length) {
      notas = await contar(avaliar, pergunta, docs.map((d) => ({ ...d })));
      if (!Array.isArray(notas)) throw new Error('avaliar deve devolver uma lista de { id, nota }');
    }
    const porId = new Map();
    for (const n of notas) if (n && typeof n.id === 'string' && !porId.has(n.id)) porId.set(n.id, nota01(n.nota)); // a primeira nota de um id vale
    const pontuados = docs.map((d) => ({ ...d, nota: porId.get(d.id) ?? 0 }));
    const melhor = pontuados.reduce((m, d) => Math.max(m, d.nota), 0);
    const classe = melhor >= lim.correto ? 'correta' : melhor >= lim.incorreto ? 'ambigua' : 'incorreta';
    passos.push({ passo: 'avaliacao', consulta, classe, melhor, notas: pontuados.map((d) => [d.id, d.nota]), ...(descartados ? { descartados } : {}) });
    return { pontuados, classe };
  }

  let consulta = pergunta;
  let { pontuados, classe } = await avaliarEClassificar(consulta, await contar(recuperar, consulta), 'recuperar');
  let reescritas = 0;

  while (classe === 'incorreta' && reescrever && reescritas < maxReescritas) {
    reescritas += 1;
    const nova = await contar(reescrever, pergunta, reescritas);
    if (typeof nova !== 'string' || !nova.trim()) { passos.push({ passo: 'reescrita_invalida', tentativa: reescritas }); break; }
    consulta = nova;
    passos.push({ passo: 'reescrita', tentativa: reescritas, consulta });
    ({ pontuados, classe } = await avaliarEClassificar(consulta, await contar(recuperar, consulta), 'recuperar'));
  }

  let usados = pontuados.filter((d) => d.nota >= lim.incorreto); // nunca passa lixo ao gerador
  if (classe === 'correta') {
    usados = pontuados.filter((d) => d.nota >= lim.correto);
  } else if (classe === 'ambigua' && buscaExterna) {
    const extras = await contar(buscaExterna, consulta);
    const { pontuados: ext } = await avaliarEClassificar(`externa: ${consulta}`, extras, 'buscaExterna');
    const novos = ext.filter((d) => d.nota >= lim.correto && !usados.some((u) => u.id === d.id));
    usados = [...usados, ...novos];
    passos.push({ passo: 'complemento_externo', adicionados: novos.map((u) => u.id) });
  }

  if (!usados.length) {
    passos.push({ passo: 'abstencao', motivo: 'sem evidência suficiente após a avaliação' });
    return { acao: 'abstencao', resposta: null, abstencao: true, classe, docsUsados: [], passos, chamadas };
  }
  const resposta = await contar(gerar, pergunta, usados.map(({ id, texto, nota }) => ({ id, texto, nota })));
  if (typeof resposta !== 'string' || !resposta.trim()) {
    passos.push({ passo: 'abstencao', motivo: 'o gerador não devolveu uma resposta em texto' });
    return { acao: 'abstencao', resposta: null, abstencao: true, classe, docsUsados: [], passos, chamadas };
  }
  passos.push({ passo: 'geracao', fontes: usados.map((d) => d.id) });
  return { acao: classe === 'correta' ? 'usar' : 'complementar', resposta, abstencao: false, classe, docsUsados: usados.map((d) => d.id), passos, chamadas };
}
