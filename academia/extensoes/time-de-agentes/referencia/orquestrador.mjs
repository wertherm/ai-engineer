// Orquestrador de um time de agentes. Sem dependências (Node 22+) e sem LLM embutido: os agentes, os avaliadores e o
// roteador são FUNÇÕES que você injeta. Assim o mesmo núcleo roda com agentes simulados (testes determinísticos) e com
// agentes de LLM (veja agente-llm.mjs).
//
// Padrões do guia "Building effective agents" (Anthropic) que ele implementa:
//   - orchestrator-workers: um agente pode propor NOVAS TAREFAS; o orquestrador as valida, cria e distribui;
//   - evaluator-optimizer: o resultado passa por uma CADEIA de avaliadores; reprovado volta ao executor com feedback.
// E os controles que o tornam seguro para uso diário:
//   - toda tarefa tem CRITÉRIOS de aceitação (sem critério, sem tarefa);
//   - orçamento duro: tarefas, profundidade, tentativas e chamadas (impede loop e explosão de tarefas);
//   - proposta de tarefa/lição é validada, deduplicada e nunca contém segredos;
//   - aprendizado só entra na memória com APROVAÇÃO (humana, por padrão): evita memória envenenada;
//   - escalonamento para um humano quando as tentativas acabam; auditoria de tudo.
import { acharSegredos } from '../../../ferramentas/comum.mjs';
import { TIPOS } from '../../memoria-persistente-mcp/referencia/memoria.mjs';

export const ORCAMENTO_PADRAO = { maxTarefas: 20, maxProfundidade: 3, maxTentativas: 3, maxChamadas: 60 };
const CHAVE = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;
const normalizar = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const texto = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

/** Roteador simples por palavras-chave: { papel: ['palavra', ...] }. É um exemplo de "camada de decisão" plugável. */
export function roteadorPorPalavrasChave(mapa, padrao) {
  return (tarefa) => {
    const alvo = normalizar(`${tarefa.titulo} ${tarefa.descricao ?? ''}`);
    let melhor = { papel: padrao, pontos: 0 };
    for (const [papel, palavras] of Object.entries(mapa)) {
      const pontos = palavras.filter((p) => alvo.includes(normalizar(p))).length;
      if (pontos > melhor.pontos) melhor = { papel, pontos };
    }
    return melhor.papel;
  };
}

/**
 * @param {object} cfg
 * @param {Record<string, (tarefa: object, ctx: object) => Promise<{resultado: string, novas_tarefas?: object[], licoes?: object[]}>>} cfg.agentes
 * @param {{nome: string, avaliar: Function, aplicaA?: (t: object) => boolean}[]} [cfg.avaliadores] cadeia: todos precisam aprovar, na ordem
 * @param {(proposta: object) => string|Promise<string>} [cfg.roteador] escolhe o papel de tarefas sem `papel`
 * @param {object} [cfg.orcamento]
 * @param {{salvar: Function, buscar: Function}} [cfg.memoria] memória persistente (veja memoria-persistente-mcp)
 * @param {string} [cfg.escopoProjeto] escopo da memória deste projeto
 * @param {string} [cfg.escopoGlobal] escopo de aprendizados que valem para todos os projetos
 * @param {(info: object) => Promise<{acao: 'aprovar'|'rejeitar'}>} [cfg.humano] decide quando as tentativas acabam
 * @param {(evento: object) => void} [cfg.auditoria]
 */
export function criarOrquestrador({ agentes, avaliadores = [], roteador, orcamento = {}, memoria, escopoProjeto, escopoGlobal = 'global', humano, auditoria = () => {}, agora = () => new Date() }) {
  if (!agentes || !Object.keys(agentes).length || Object.values(agentes).some((f) => typeof f !== 'function')) {
    throw new Error('agentes deve ser um objeto { papel: funcao } com ao menos um papel');
  }
  for (const a of avaliadores) if (!a?.nome || typeof a.avaliar !== 'function') throw new Error('cada avaliador precisa de nome e avaliar()');
  if (memoria && !escopoProjeto) throw new Error('com memória, informe escopoProjeto');
  const orc = { ...ORCAMENTO_PADRAO, ...orcamento };
  const papeis = new Set(Object.keys(agentes));

  let tarefas = [];
  let licoes = [];
  let rejeitadas = [];
  let chamadas = 0;
  let contador = 0;
  const log = (evento, dados = {}) => auditoria({ quando: agora().toISOString(), evento, ...dados });

  // ---- criação de tarefas ---------------------------------------------------------------------------------------
  async function criar(proposta, pai, lote = []) {
    const rejeitar = (motivo) => {
      rejeitadas.push({ proposta: { titulo: String(proposta?.titulo ?? '').slice(0, 80) }, motivo, pai: pai?.id ?? null });
      log('proposta_rejeitada', { motivo, pai: pai?.id ?? null, titulo: String(proposta?.titulo ?? '').slice(0, 80) });
      return { ok: false, motivo };
    };
    if (!proposta || typeof proposta !== 'object') return rejeitar('proposta_invalida');
    if (!texto(proposta.titulo, 3, 120)) return rejeitar('titulo_invalido');
    if (proposta.descricao !== undefined && !texto(proposta.descricao, 0, 2000)) return rejeitar('descricao_invalida');
    const criterios = proposta.criterios;
    if (!Array.isArray(criterios) || criterios.length < 1 || criterios.length > 8 || criterios.some((c) => !texto(c, 3, 300))) {
      return rejeitar('criterios_invalidos'); // sem critério de aceitação não há como avaliar
    }
    if (acharSegredos([proposta.titulo, proposta.descricao ?? '', ...criterios].join('\n')).length) return rejeitar('segredo_na_tarefa');
    const profundidade = (pai?.profundidade ?? -1) + 1;
    if (profundidade > orc.maxProfundidade) return rejeitar('profundidade_excedida');
    if (tarefas.length >= orc.maxTarefas) return rejeitar('limite_de_tarefas');

    let papel = proposta.papel;
    if (!papel && roteador) papel = await roteador(proposta);
    if (!papeis.has(papel)) return rejeitar('papel_desconhecido');
    if (tarefas.some((t) => t.papel === papel && normalizar(t.titulo) === normalizar(proposta.titulo))) return rejeitar('duplicada');

    const deps = [];
    for (const d of proposta.depende_de ?? []) {
      const id = Number.isInteger(d) ? lote[d] : d; // número = posição de uma proposta anterior do mesmo lote
      if (!id || !tarefas.some((t) => t.id === id)) return rejeitar('dependencia_invalida');
      deps.push(id);
    }
    const tarefa = {
      id: `t${++contador}`, titulo: proposta.titulo.trim(), descricao: proposta.descricao?.trim() ?? '', papel, criterios: criterios.map((c) => c.trim()),
      depende_de: deps, pai: pai?.id ?? null, profundidade, estado: 'pendente', tentativas: 0, feedback: [], avaliacoes: [], entrega: null,
    };
    tarefas.push(tarefa);
    log('tarefa_criada', { tarefa: tarefa.id, papel, pai: tarefa.pai, titulo: tarefa.titulo });
    return { ok: true, tarefa };
  }

  async function criarLote(propostas, pai) {
    const ids = [];
    for (const p of Array.isArray(propostas) ? propostas : []) {
      const r = await criar(p, pai, ids);
      ids.push(r.ok ? r.tarefa.id : null);
    }
  }

  // ---- aprendizados -----------------------------------------------------------------------------------------------
  function proporLicoes(brutas, origem) {
    for (const l of Array.isArray(brutas) ? brutas : []) {
      const ok = l && TIPOS.includes(l.tipo) && CHAVE.test(l.chave ?? '') && texto(l.valor, 3, 2000) && ['projeto', 'global'].includes(l.escopo ?? 'projeto');
      if (!ok || acharSegredos(l.valor).length) {
        log('licao_rejeitada', { origem, motivo: ok ? 'segredo' : 'formato' });
        continue;
      }
      licoes.push({ id: `l${licoes.length + 1}`, tipo: l.tipo, chave: l.chave, valor: l.valor.trim(), escopo: l.escopo ?? 'projeto', origem, estado: 'pendente' });
      log('licao_proposta', { origem, id: `l${licoes.length}` });
    }
  }

  function aprovarLicao(id) {
    const l = licoes.find((x) => x.id === id);
    if (!l) throw new Error(`lição ${id} não existe`);
    if (l.estado !== 'pendente') throw new Error(`lição ${id} já foi ${l.estado}`);
    if (!memoria) throw new Error('sem memória configurada: nada para gravar');
    memoria.salvar({ escopo: l.escopo === 'global' ? escopoGlobal : escopoProjeto, chave: l.chave, tipo: l.tipo, valor: l.valor, fonte: `time:${l.origem}` });
    l.estado = 'aprovada';
    log('licao_aprovada', { id, escopo: l.escopo });
    return l;
  }

  function rejeitarLicao(id) {
    const l = licoes.find((x) => x.id === id);
    if (!l || l.estado !== 'pendente') throw new Error(`lição ${id} não está pendente`);
    l.estado = 'rejeitada';
    log('licao_rejeitada_pelo_humano', { id });
    return l;
  }

  // ---- execução ---------------------------------------------------------------------------------------------------
  const prontas = () => tarefas.filter((t) => ['pendente', 'em_revisao'].includes(t.estado) && t.depende_de.every((d) => tarefas.find((x) => x.id === d).estado === 'aprovada'));

  function bloquearDependentes() {
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const t of tarefas) {
        if (!['pendente', 'em_revisao'].includes(t.estado)) continue;
        const falhou = t.depende_de.find((d) => ['escalada', 'bloqueada', 'nao_executada'].includes(tarefas.find((x) => x.id === d).estado));
        if (falhou) { t.estado = 'bloqueada'; t.motivo = `dependência ${falhou} não foi aprovada`; log('bloqueada', { tarefa: t.id, dependencia: falhou }); mudou = true; }
      }
    }
  }

  function memoriasRelevantes(t) {
    if (!memoria) return [];
    const itens = [];
    for (const escopo of [escopoGlobal, escopoProjeto]) {
      try { itens.push(...memoria.buscar({ escopo, consulta: `${t.titulo} ${t.descricao}`, limite: 5 }).itens.map((i) => ({ escopo, chave: i.chave, tipo: i.tipo, valor: i.valor }))); } catch { /* escopo não liberado */ }
    }
    return itens; // vão ao agente marcadas como DADO, nunca como instrução
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

  async function executarTarefa(t) {
    t.estado = 'em_execucao';
    t.tentativas += 1;
    const ctx = { tentativa: t.tentativas, feedback: [...t.feedback], memorias: memoriasRelevantes(t), orcamento: { ...orc, chamadasRestantes: orc.maxChamadas - chamadas } };
    chamadas += 1;
    let entrega;
    try {
      entrega = await agentes[t.papel]({ id: t.id, titulo: t.titulo, descricao: t.descricao, criterios: t.criterios, papel: t.papel, profundidade: t.profundidade }, ctx);
      if (!entrega || !texto(entrega.resultado, 1, 20_000)) throw new Error('o agente não devolveu { resultado: texto }');
    } catch (e) {
      log('execucao_falhou', { tarefa: t.id, tentativa: t.tentativas, erro: String(e.message).slice(0, 200) });
      t.feedback.push(`erro do executor: ${String(e.message).slice(0, 200)}`);
      return decidirTentativa(t);
    }
    t.entrega = entrega;
    log('execucao', { tarefa: t.id, papel: t.papel, tentativa: t.tentativas, tamanho: entrega.resultado.length });

    for (const av of avaliadores.filter((a) => !a.aplicaA || a.aplicaA(t))) {
      if (chamadas >= orc.maxChamadas) { log('parada_por_orcamento', { tarefa: t.id }); t.estado = 'nao_executada'; t.motivo = 'orçamento de chamadas esgotado durante a avaliação'; return; }
      chamadas += 1;
      let r;
      try {
        r = await av.avaliar({ id: t.id, titulo: t.titulo, criterios: t.criterios, papel: t.papel }, entrega, { tentativa: t.tentativas });
        if (typeof r?.aprovado !== 'boolean') throw new Error('o avaliador precisa devolver { aprovado: boolean }');
        if (!r.aprovado && !texto(r.feedback, 3, 2000)) throw new Error('reprovação exige feedback acionável');
      } catch (e) {
        r = { aprovado: false, feedback: `avaliador ${av.nome} falhou: ${String(e.message).slice(0, 150)}` };
      }
      const nota = Number.isFinite(r.nota) ? Math.min(1, Math.max(0, r.nota)) : undefined;
      t.avaliacoes.push({ avaliador: av.nome, tentativa: t.tentativas, aprovado: r.aprovado, nota, feedback: r.feedback, extras: r.aprovado ? { novas_tarefas: r.novas_tarefas, licoes: r.licoes } : undefined });
      log('avaliacao', { tarefa: t.id, avaliador: av.nome, aprovado: r.aprovado, nota, tentativa: t.tentativas });
      if (!r.aprovado) { t.feedback.push(`${av.nome}: ${r.feedback}`); return decidirTentativa(t); }
    }
    await aprovar(t, 'avaliadores');
  }

  async function decidirTentativa(t) {
    if (t.tentativas < orc.maxTentativas) { t.estado = 'em_revisao'; log('revisao', { tarefa: t.id, proxima: t.tentativas + 1 }); return; }
    log('tentativas_esgotadas', { tarefa: t.id });
    if (humano) {
      const d = await humano({ tarefa: t.id, titulo: t.titulo, feedback: [...t.feedback], entrega: t.entrega?.resultado ?? null });
      if (d?.acao === 'aprovar' && t.entrega) return aprovar(t, 'humano');
    }
    t.estado = 'escalada';
    t.motivo = 'tentativas esgotadas sem aprovação';
    log('escalada', { tarefa: t.id });
  }

  async function executar(raiz) {
    tarefas = []; licoes = []; rejeitadas = []; chamadas = 0; contador = 0;
    const r = await criar(raiz, null);
    if (!r.ok) throw new Error(`tarefa inicial rejeitada: ${r.motivo}`);
    let parada = 'concluido';
    for (;;) {
      bloquearDependentes();
      const t = prontas()[0];
      if (!t) break;
      if (chamadas >= orc.maxChamadas) { parada = 'orcamento_de_chamadas'; break; }
      await executarTarefa(t);
    }
    for (const t of tarefas) if (['pendente', 'em_revisao'].includes(t.estado)) { t.estado = 'nao_executada'; t.motivo = parada === 'concluido' ? 'sem executor disponível' : 'orçamento esgotado'; }
    const porEstado = {};
    for (const t of tarefas) porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
    log('fim', { parada, chamadas, porEstado });
    return { parada, chamadas, porEstado, tarefas: structuredClone(tarefas), licoes: structuredClone(licoes), rejeitadas: structuredClone(rejeitadas) };
  }

  return { executar, aprovarLicao, rejeitarLicao, licoes: () => structuredClone(licoes) };
}
