// Orquestrador de um time de agentes. Sem dependências (Node 22+) e sem LLM embutido: os agentes, os avaliadores e o
// roteador são FUNÇÕES que você injeta. Assim o mesmo núcleo roda com agentes simulados (testes determinísticos) e com
// agentes de LLM (veja agente-llm.mjs).
//
// Padrões do guia "Building effective agents" (Anthropic) que ele implementa:
//   - orchestrator-workers: um agente pode propor NOVAS TAREFAS; o orquestrador as valida, cria e distribui;
//   - evaluator-optimizer: o resultado passa por uma CADEIA de avaliadores; reprovado volta ao executor com feedback.
// E os controles que o tornam seguro para uso diário:
//   - toda tarefa tem CRITÉRIOS de aceitação (sem critério, sem tarefa) e NUNCA é aprovada sem alguém que a avalie:
//     sem avaliador aplicável a tarefa vai para o humano (ou fica escalada), a menos que `aprovarSemAvaliador` seja ligado de propósito;
//   - orçamento duro e validado: tarefas, profundidade, tentativas, chamadas, filhas por tarefa, lições e tempo por chamada;
//   - delegação controlada: quem pode delegar a quem (`delegacoes`), um gancho de revisão (`aprovarDelegacao`) e limite de filhas;
//   - proposta de tarefa/lição é validada, deduplicada e nunca contém segredos nem caracteres de controle;
//   - segredo numa entrega reprova a tentativa (a entrega nem chega aos avaliadores nem ao relatório);
//   - aprendizado só entra na memória com APROVAÇÃO (humana, por padrão): evita memória envenenada;
//   - falha em qualquer função injetada (agente, avaliador, roteador, humano, auditoria) NUNCA derruba a execução;
//   - escalonamento para um humano quando as tentativas acabam; auditoria de tudo, com segredos mascarados.
import { acharSegredos, mascararProfundo, mascararSegredos, neutralizarControles, temControle } from '../../../ferramentas/comum.mjs';
import { TIPOS } from '../../memoria-persistente-mcp/referencia/memoria.mjs';

export const ORCAMENTO_PADRAO = { maxTarefas: 20, maxProfundidade: 3, maxTentativas: 3, maxChamadas: 60, maxFilhas: 5, maxLicoes: 20, timeoutMs: 300_000 };
const FAIXAS_ORCAMENTO = { maxTarefas: [1, 200], maxProfundidade: [0, 8], maxTentativas: [1, 10], maxChamadas: [1, 1000], maxFilhas: [0, 20], maxLicoes: [0, 100], timeoutMs: [1, 3_600_000] };
export const LIMITES = { entrada: 60_000, resultado: 20_000, propostasPorEntrega: 8, licoesPorEntrega: 5, evidencias: 50 };

const CHAVE = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;
const PAPEL = /^[a-z][a-z0-9_.-]{0,40}$/;
const normalizar = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const palavras = (s) => normalizar(s).replace(/[^a-z0-9]+/g, ' ').trim();
const texto = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const curto = (v, n = 200) => neutralizarControles(mascararSegredos(String(v ?? ''))).slice(0, n);
/** Cópia profunda de uma lista de propostas (no máximo `max`); devolve undefined se não for uma lista de JSON puro. */
const copiarLista = (lista, max) => {
  if (!Array.isArray(lista)) return undefined;
  try { return structuredClone(lista.slice(0, max)); } catch { return undefined; }
};

/** Roteador simples por palavras INTEIRAS (ou frases): { papel: ['palavra', ...] }. Exemplo de "camada de decisão" plugável. */
export function roteadorPorPalavrasChave(mapa, padrao) {
  if (!ehObjeto(mapa) || Object.values(mapa).some((l) => !Array.isArray(l))) throw new Error('mapa deve ser { papel: [palavras] }');
  return (tarefa) => {
    const alvo = ` ${palavras(`${tarefa.titulo} ${tarefa.descricao ?? ''}`)} `;
    let melhor = { papel: padrao, pontos: 0 };
    for (const [papel, lista] of Object.entries(mapa)) {
      const pontos = lista.filter((p) => palavras(p) && alvo.includes(` ${palavras(p)} `)).length;
      if (pontos > melhor.pontos) melhor = { papel, pontos };
    }
    return melhor.papel;
  };
}

/** Motivo pelo qual uma lição proposta não serve (ou null se está tudo certo). Exportada: o CLI revalida antes de gravar. */
export function motivoDaLicao(l) {
  if (!ehObjeto(l)) return 'formato';
  const ok = TIPOS.includes(l.tipo) && typeof l.chave === 'string' && CHAVE.test(l.chave) && texto(l.valor, 3, 2000) && ['projeto', 'global'].includes(l.escopo ?? 'projeto');
  if (!ok) return 'formato';
  if (temControle(l.valor)) return 'controle';
  if (acharSegredos(l.valor).length) return 'segredo';
  return null;
}

/** Grava uma lição aprovada na memória, no escopo certo. Compartilhada pelo orquestrador e pelo CLI. */
export function gravarLicao(memoria, l, { escopoProjeto, escopoGlobal = 'global' }) {
  const motivo = motivoDaLicao(l);
  if (motivo) throw new Error(`lição ${l.id ?? '?'} inválida (${motivo})`);
  return memoria.salvar({ escopo: (l.escopo ?? 'projeto') === 'global' ? escopoGlobal : escopoProjeto, chave: l.chave, tipo: l.tipo, valor: l.valor, fonte: `time:${curto(l.origem ?? 'manual', 40)}` });
}

function validarOrcamento(orcamento) {
  if (!ehObjeto(orcamento)) throw new Error('orcamento deve ser um objeto');
  for (const [k, v] of Object.entries(orcamento)) {
    const faixa = FAIXAS_ORCAMENTO[k];
    if (!faixa) throw new Error(`orcamento.${curto(k, 40)}: campo desconhecido (campos: ${Object.keys(FAIXAS_ORCAMENTO).join(', ')})`);
    if (!Number.isInteger(v) || v < faixa[0] || v > faixa[1]) throw new Error(`orcamento.${k} deve ser um inteiro de ${faixa[0]} a ${faixa[1]}`);
  }
  return { ...ORCAMENTO_PADRAO, ...orcamento };
}

/**
 * @param {object} cfg
 * @param {Record<string, (tarefa: object, ctx: object) => Promise<{resultado: string, novas_tarefas?: object[], licoes?: object[], evidencias?: object[]}>>} cfg.agentes
 * @param {{nome: string, avaliar: Function, aplicaA?: (t: object) => boolean}[]} [cfg.avaliadores] cadeia: todos precisam aprovar, na ordem
 * @param {(proposta: object) => string|Promise<string>} [cfg.roteador] escolhe o papel de tarefas sem `papel`
 * @param {object} [cfg.orcamento] campos: maxTarefas, maxProfundidade, maxTentativas, maxChamadas, maxFilhas, maxLicoes, timeoutMs
 * @param {{salvar: Function, buscar: Function}} [cfg.memoria] memória persistente (veja memoria-persistente-mcp)
 * @param {string} [cfg.escopoProjeto] escopo da memória deste projeto
 * @param {string} [cfg.escopoGlobal] escopo de aprendizados que valem para todos os projetos
 * @param {(info: object) => Promise<{acao: 'aprovar'|'rejeitar'}>} [cfg.humano] decide quando as tentativas acabam ou não há avaliador
 * @param {(evento: object) => void} [cfg.auditoria]
 * @param {boolean} [cfg.aprovarSemAvaliador] ligar de propósito para aprovar tarefas sem avaliador aplicável (fica registrado na auditoria)
 * @param {Record<string, string[]>} [cfg.delegacoes] se informado, { papelPai: [papéis que ele pode criar] }; fora disso a delegação é negada
 * @param {(proposta: object, pai: object) => boolean|Promise<boolean>} [cfg.aprovarDelegacao] revisão extra de cada tarefa criada por um agente
 */
export function criarOrquestrador({
  agentes, avaliadores = [], roteador, orcamento = {}, memoria, escopoProjeto, escopoGlobal = 'global', humano, auditoria = () => {},
  agora = () => new Date(), aprovarSemAvaliador = false, delegacoes, aprovarDelegacao,
}) {
  if (!ehObjeto(agentes) || !Object.keys(agentes).length || Object.values(agentes).some((f) => typeof f !== 'function')) {
    throw new Error('agentes deve ser um objeto { papel: funcao } com ao menos um papel');
  }
  for (const papel of Object.keys(agentes)) if (!PAPEL.test(papel)) throw new Error(`nome de papel inválido: "${curto(papel, 40)}" (use a-z, 0-9, _ . -)`);
  if (!Array.isArray(avaliadores)) throw new Error('avaliadores deve ser uma lista');
  for (const a of avaliadores) if (!a?.nome || typeof a.avaliar !== 'function' || (a.aplicaA !== undefined && typeof a.aplicaA !== 'function')) throw new Error('cada avaliador precisa de nome e avaliar() (e aplicaA, se houver, deve ser função)');
  for (const [nome, f] of Object.entries({ roteador, humano, aprovarDelegacao })) if (f !== undefined && typeof f !== 'function') throw new Error(`${nome} deve ser uma função`);
  if (typeof auditoria !== 'function') throw new Error('auditoria deve ser uma função');
  if (memoria && !escopoProjeto) throw new Error('com memória, informe escopoProjeto');
  if (memoria && (typeof memoria.salvar !== 'function' || typeof memoria.buscar !== 'function')) throw new Error('memoria deve ter salvar() e buscar()');
  if (delegacoes !== undefined && (!ehObjeto(delegacoes) || Object.values(delegacoes).some((l) => !Array.isArray(l)))) throw new Error('delegacoes deve ser { papel: [papéis] }');
  const orc = validarOrcamento(orcamento);
  const papeis = new Set(Object.keys(agentes));

  let tarefas = [];
  let licoes = [];
  let rejeitadas = [];
  let chamadas = 0;
  let contador = 0;
  let emExecucao = false;
  let falhasDeAuditoria = 0;

  /** Auditoria nunca derruba a execução e nunca recebe segredo. */
  const log = (evento, dados = {}) => {
    try {
      const r = auditoria(mascararProfundo({ quando: agora().toISOString(), evento, ...dados }));
      if (r && typeof r.then === 'function') r.then(undefined, () => { falhasDeAuditoria += 1; });
    } catch { falhasDeAuditoria += 1; }
  };

  /** Chama uma função injetada com tempo máximo e sinal de cancelamento. Não mata o código dela: ela precisa respeitar `signal`. */
  async function comTempo(fn) {
    const controle = new AbortController();
    let relogio;
    try {
      return await Promise.race([
        new Promise((ok) => ok(fn(controle.signal))),
        new Promise((_, rej) => { relogio = setTimeout(() => { rej(new Error(`tempo esgotado (${orc.timeoutMs} ms)`)); controle.abort(); }, orc.timeoutMs); }),
      ]);
    } finally { clearTimeout(relogio); }
  }

  // ---- criação de tarefas ---------------------------------------------------------------------------------------
  async function criar(proposta, pai, lote = []) {
    const rejeitar = (motivo) => {
      const titulo = curto(proposta?.titulo, 80);
      rejeitadas.push({ proposta: { titulo }, motivo, pai: pai?.id ?? null });
      log('proposta_rejeitada', { motivo, pai: pai?.id ?? null, titulo });
      return { ok: false, motivo };
    };
    if (!ehObjeto(proposta)) return rejeitar('proposta_invalida');
    if (!texto(proposta.titulo, 3, 120)) return rejeitar('titulo_invalido');
    if (proposta.descricao !== undefined && !texto(proposta.descricao, 0, 2000)) return rejeitar('descricao_invalida');
    const criterios = proposta.criterios;
    if (!Array.isArray(criterios) || criterios.length < 1 || criterios.length > 8 || criterios.some((c) => !texto(c, 3, 300))) {
      return rejeitar('criterios_invalidos'); // sem critério de aceitação não há como avaliar
    }
    if (proposta.entrada !== undefined && !texto(proposta.entrada, 1, LIMITES.entrada)) return rejeitar('entrada_invalida');
    if (proposta.depende_de !== undefined && (!Array.isArray(proposta.depende_de) || proposta.depende_de.length > 8)) return rejeitar('dependencia_invalida');
    const visiveis = [proposta.titulo, proposta.descricao ?? '', ...criterios].join('\n');
    if (temControle(visiveis)) return rejeitar('controle_na_tarefa');
    if (acharSegredos([visiveis, proposta.entrada ?? ''].join('\n')).length) return rejeitar('segredo_na_tarefa');
    const profundidade = (pai?.profundidade ?? -1) + 1;
    if (profundidade > orc.maxProfundidade) return rejeitar('profundidade_excedida');
    if (tarefas.length >= orc.maxTarefas) return rejeitar('limite_de_tarefas');
    if (pai && tarefas.filter((t) => t.pai === pai.id).length >= orc.maxFilhas) return rejeitar('limite_de_filhas');

    let papel = proposta.papel;
    if (!papel && roteador) {
      try { papel = await roteador({ titulo: proposta.titulo, descricao: proposta.descricao, criterios }); } catch { return rejeitar('roteador_falhou'); }
    }
    if (typeof papel !== 'string' || !papeis.has(papel)) return rejeitar('papel_desconhecido');
    if (tarefas.some((t) => t.papel === papel && normalizar(t.titulo) === normalizar(proposta.titulo))) return rejeitar('duplicada');
    if (pai && delegacoes && !(Object.hasOwn(delegacoes, pai.papel) && delegacoes[pai.papel].includes(papel))) return rejeitar('delegacao_nao_permitida');
    if (pai && aprovarDelegacao) {
      let liberada = false;
      try { liberada = (await aprovarDelegacao({ titulo: proposta.titulo, papel, criterios: [...criterios] }, { id: pai.id, papel: pai.papel, titulo: pai.titulo })) === true; } catch { liberada = false; }
      if (!liberada) return rejeitar('delegacao_nao_aprovada');
    }

    const deps = [];
    for (const d of proposta.depende_de ?? []) {
      const id = Number.isInteger(d) ? lote[d] : d; // número = posição de uma proposta anterior do mesmo lote
      if (!id || !tarefas.some((t) => t.id === id)) return rejeitar('dependencia_invalida');
      deps.push(id);
    }
    const entrada = proposta.entrada !== undefined ? neutralizarControles(proposta.entrada) : pai?.entrada; // a entrada do dono vale para as filhas
    const tarefa = {
      id: `t${++contador}`, titulo: proposta.titulo.trim(), descricao: proposta.descricao?.trim() ?? '', papel, criterios: criterios.map((c) => c.trim()),
      depende_de: deps, pai: pai?.id ?? null, profundidade, estado: 'pendente', tentativas: 0, feedback: [], avaliacoes: [], entrega: null,
      ...(entrada !== undefined ? { entrada } : {}),
    };
    tarefas.push(tarefa);
    log('tarefa_criada', { tarefa: tarefa.id, papel, pai: tarefa.pai, titulo: tarefa.titulo });
    return { ok: true, tarefa };
  }

  async function criarLote(propostas, pai) {
    const ids = [];
    for (const p of Array.isArray(propostas) ? propostas.slice(0, LIMITES.propostasPorEntrega) : []) {
      const r = await criar(p, pai, ids);
      ids.push(r.ok ? r.tarefa.id : null);
    }
  }

  // ---- aprendizados -----------------------------------------------------------------------------------------------
  function proporLicoes(brutas, origem) {
    for (const l of Array.isArray(brutas) ? brutas.slice(0, LIMITES.licoesPorEntrega) : []) {
      const motivo = motivoDaLicao(l);
      if (motivo) { log('licao_rejeitada', { origem, motivo }); continue; }
      if (licoes.length >= orc.maxLicoes) { log('licao_rejeitada', { origem, motivo: 'limite' }); continue; }
      const escopo = l.escopo ?? 'projeto';
      if (licoes.some((x) => x.estado === 'pendente' && x.escopo === escopo && x.chave === l.chave)) { log('licao_rejeitada', { origem, motivo: 'duplicada' }); continue; }
      licoes.push({ id: `l${licoes.length + 1}`, tipo: l.tipo, chave: l.chave, valor: l.valor.trim(), escopo, origem, estado: 'pendente' });
      log('licao_proposta', { origem, id: `l${licoes.length}` });
    }
  }

  function aprovarLicao(id) {
    const l = licoes.find((x) => x.id === id);
    if (!l) throw new Error(`lição ${curto(id, 20)} não existe`);
    if (l.estado !== 'pendente') throw new Error(`lição ${id} já foi ${l.estado}`);
    if (!memoria) throw new Error('sem memória configurada: nada para gravar');
    gravarLicao(memoria, l, { escopoProjeto, escopoGlobal });
    l.estado = 'aprovada';
    log('licao_aprovada', { id, escopo: l.escopo });
    return structuredClone(l);
  }

  function rejeitarLicao(id) {
    const l = licoes.find((x) => x.id === id);
    if (!l || l.estado !== 'pendente') throw new Error(`lição ${curto(id, 20)} não está pendente`);
    l.estado = 'rejeitada';
    log('licao_rejeitada_pelo_humano', { id });
    return structuredClone(l);
  }

  // ---- execução ---------------------------------------------------------------------------------------------------
  const estadoDe = (id) => tarefas.find((x) => x.id === id).estado;
  const prontas = () => tarefas.filter((t) => ['pendente', 'em_revisao'].includes(t.estado) && t.depende_de.every((d) => estadoDe(d) === 'aprovada'));

  function bloquearDependentes() {
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const t of tarefas) {
        if (!['pendente', 'em_revisao'].includes(t.estado)) continue;
        const falhou = t.depende_de.find((d) => ['escalada', 'bloqueada', 'nao_executada'].includes(estadoDe(d)));
        if (falhou) { t.estado = 'bloqueada'; t.motivo = `dependência ${falhou} não foi aprovada`; log('bloqueada', { tarefa: t.id, dependencia: falhou }); mudou = true; }
      }
    }
  }

  function memoriasRelevantes(t) {
    if (!memoria) return [];
    const itens = [];
    for (const escopo of [escopoGlobal, escopoProjeto]) {
      try { itens.push(...memoria.buscar({ escopo, consulta: `${t.titulo} ${t.descricao}`.slice(0, 400), limite: 5 }).itens.map((i) => ({ escopo, chave: i.chave, tipo: i.tipo, valor: i.valor }))); } catch { /* escopo não liberado */ }
    }
    return itens; // vão ao agente marcadas como DADO, nunca como instrução
  }

  const paraExecutor = (t) => ({ id: t.id, titulo: t.titulo, descricao: t.descricao, criterios: [...t.criterios], papel: t.papel, profundidade: t.profundidade, ...(t.entrada !== undefined ? { entrada: t.entrada } : {}) });

  /** Copia só o que o orquestrador conhece de uma entrega; o agente não consegue mudá-la depois. Lança se estiver inválida. */
  function normalizarEntrega(bruta) {
    if (!ehObjeto(bruta) || !texto(bruta.resultado, 1, LIMITES.resultado)) throw new Error('o agente não devolveu { resultado: texto }');
    const e = { resultado: neutralizarControles(bruta.resultado) };
    for (const [campo, max] of [['novas_tarefas', LIMITES.propostasPorEntrega], ['licoes', LIMITES.licoesPorEntrega], ['evidencias', LIMITES.evidencias]]) {
      const copia = copiarLista(bruta[campo], max);
      if (copia) e[campo] = copia;
    }
    return e;
  }

  async function aprovar(t, por) {
    t.estado = 'aprovada';
    t.aprovada_por = por;
    log('aprovada', { tarefa: t.id, por, tentativas: t.tentativas });
    await criarLote(t.entrega.novas_tarefas, t);
    proporLicoes(t.entrega.licoes, t.id);
    for (const a of t.avaliacoes.filter((x) => x.tentativa === t.tentativas && x.extras)) {
      await criarLote(a.extras.novas_tarefas, t);
      proporLicoes(a.extras.licoes, t.id);
    }
  }

  /** Pede a decisão de um humano (se houver). Qualquer falha ou resposta diferente de "aprovar" deixa a tarefa escalada. */
  async function escalar(t, motivo) {
    log('escalonamento', { tarefa: t.id, motivo });
    if (humano) {
      let d = null;
      try {
        d = await humano({
          tarefa: t.id, titulo: curto(t.titulo, 120), motivo, criterios: t.criterios.map((c) => curto(c, 300)),
          feedback: t.feedback.map((f) => curto(f, 2000)),
          entrega: t.entrega ? neutralizarControles(mascararSegredos(t.entrega.resultado)).slice(0, LIMITES.resultado) : null,
          propostas: t.entrega ? { novas_tarefas: (t.entrega.novas_tarefas ?? []).map((n) => curto(n?.titulo, 120)), licoes: (t.entrega.licoes ?? []).map((l) => curto(l?.chave, 64)) } : null,
        });
      } catch (e) { log('humano_falhou', { tarefa: t.id, erro: curto(e?.message ?? e) }); }
      if (d?.acao === 'aprovar' && t.entrega) return aprovar(t, 'humano');
    }
    t.estado = 'escalada';
    t.motivo = motivo;
    log('escalada', { tarefa: t.id });
  }

  async function decidirTentativa(t) {
    if (t.tentativas < orc.maxTentativas) { t.estado = 'em_revisao'; log('revisao', { tarefa: t.id, proxima: t.tentativas + 1 }); return; }
    log('tentativas_esgotadas', { tarefa: t.id });
    return escalar(t, 'tentativas esgotadas sem aprovação');
  }

  const avaliadoresDe = (t) => avaliadores.filter((a) => {
    try { return !a.aplicaA || a.aplicaA(paraExecutor(t)); } catch { return true; } // na dúvida, avalia
  });

  async function executarTarefa(t) {
    t.estado = 'em_execucao';
    t.tentativas += 1;
    t.entrega = null; // uma entrega antiga nunca é aprovada por engano
    const ctx = { tentativa: t.tentativas, feedback: [...t.feedback], memorias: memoriasRelevantes(t), orcamento: { ...orc, chamadasRestantes: orc.maxChamadas - chamadas } };
    chamadas += 1;
    let entrega;
    try {
      entrega = normalizarEntrega(await comTempo((signal) => agentes[t.papel](paraExecutor(t), { ...ctx, signal })));
    } catch (e) {
      log('execucao_falhou', { tarefa: t.id, tentativa: t.tentativas, erro: curto(e?.message ?? e) });
      t.feedback.push(`erro do executor: ${curto(e?.message ?? e)}`);
      return decidirTentativa(t);
    }
    if (acharSegredos(entrega.resultado).length) {
      log('entrega_com_segredo', { tarefa: t.id, tentativa: t.tentativas });
      t.feedback.push('a entrega contém algo que parece uma credencial: remova-a e refaça (credenciais nunca vão em resultados)');
      return decidirTentativa(t);
    }
    t.entrega = entrega;
    log('execucao', { tarefa: t.id, papel: t.papel, tentativa: t.tentativas, tamanho: entrega.resultado.length });

    const cadeia = avaliadoresDe(t);
    if (!cadeia.length) {
      log('sem_avaliador', { tarefa: t.id, papel: t.papel });
      if (aprovarSemAvaliador) return aprovar(t, 'sem_avaliador');
      return escalar(t, 'nenhum avaliador se aplica a esta tarefa');
    }
    for (const av of cadeia) {
      if (chamadas >= orc.maxChamadas) { log('parada_por_orcamento', { tarefa: t.id }); t.estado = 'nao_executada'; t.motivo = 'orçamento de chamadas esgotado durante a avaliação'; return; }
      chamadas += 1;
      let r;
      try {
        const bruto = await comTempo((signal) => av.avaliar(paraExecutor(t), structuredClone(entrega), { tentativa: t.tentativas, signal }));
        if (!ehObjeto(bruto) || typeof bruto.aprovado !== 'boolean') throw new Error('o avaliador precisa devolver { aprovado: boolean }');
        if (!bruto.aprovado && !texto(bruto.feedback, 3, 2000)) throw new Error('reprovação exige feedback acionável');
        if (bruto.aprovado && Array.isArray(bruto.criterios) && bruto.criterios.some((c) => c?.atendido !== true)) throw new Error('aprovou com critério não atendido');
        r = bruto;
      } catch (e) {
        r = { aprovado: false, feedback: `avaliador ${curto(av.nome, 40)} falhou: ${curto(e?.message ?? e, 150)}` };
      }
      const nota = Number.isFinite(r.nota) ? Math.min(1, Math.max(0, r.nota)) : undefined;
      const feedback = typeof r.feedback === 'string' ? curto(r.feedback, 2000) : undefined;
      const extras = r.aprovado ? { novas_tarefas: copiarLista(r.novas_tarefas, LIMITES.propostasPorEntrega), licoes: copiarLista(r.licoes, LIMITES.licoesPorEntrega) } : undefined;
      t.avaliacoes.push({ avaliador: curto(av.nome, 40), tentativa: t.tentativas, aprovado: r.aprovado, nota, feedback, extras });
      log('avaliacao', { tarefa: t.id, avaliador: curto(av.nome, 40), aprovado: r.aprovado, nota, tentativa: t.tentativas });
      if (!r.aprovado) { t.feedback.push(`${curto(av.nome, 40)}: ${feedback}`); return decidirTentativa(t); }
    }
    await aprovar(t, 'avaliadores');
  }

  async function executar(raiz) {
    if (emExecucao) throw new Error('este orquestrador já está executando; crie outro para rodar em paralelo');
    emExecucao = true;
    try {
      tarefas = []; licoes = []; rejeitadas = []; chamadas = 0; contador = 0;
      const r = await criar(raiz, null);
      if (!r.ok) throw new Error(`tarefa inicial rejeitada: ${r.motivo}`);
      let parada = 'concluido';
      for (;;) {
        bloquearDependentes();
        const t = prontas()[0];
        if (!t) break;
        if (chamadas >= orc.maxChamadas) { parada = 'orcamento_de_chamadas'; break; }
        try {
          await executarTarefa(t);
        } catch (e) { // defesa final: um erro inesperado deixa a tarefa escalada, não derruba o resto
          log('erro_interno', { tarefa: t.id, erro: curto(e?.message ?? e) });
          t.estado = 'escalada';
          t.motivo = 'erro interno ao processar a tarefa';
        }
      }
      for (const t of tarefas) if (['pendente', 'em_revisao'].includes(t.estado)) { t.estado = 'nao_executada'; t.motivo = parada === 'concluido' ? 'sem executor disponível' : 'orçamento esgotado'; }
      const porEstado = {};
      for (const t of tarefas) porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
      log('fim', { parada, chamadas, porEstado });
      // o resultado sai SEM segredos e com texto neutralizado: ele vai para relatórios e telas
      return mascararProfundo({ parada, chamadas, porEstado, tarefas: structuredClone(tarefas), licoes: structuredClone(licoes), rejeitadas: structuredClone(rejeitadas) });
    } finally {
      emExecucao = false;
    }
  }

  return {
    executar, aprovarLicao, rejeitarLicao,
    licoes: () => mascararProfundo(structuredClone(licoes)),
    falhasDeAuditoria: () => falhasDeAuditoria,
  };
}
