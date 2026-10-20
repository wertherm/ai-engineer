#!/usr/bin/env node
// Ferramenta da Academia: valida o conteúdo e os registros, gera os arquivos de progresso e monta o kit de sessão.
// Sem dependências (Node 22+). As regras (XP, níveis, conquistas, competências, etapas) são LIDAS das tabelas de
// GAMIFICACAO.md, competencias.md e ROADMAP.md: elas são a fonte de verdade, este script só as aplica.
//
//   node academia/ferramentas/academia.mjs validar [--aluno <aluno>]   confere conteúdo, links, segredos e registros
//   node academia/ferramentas/academia.mjs progresso [<aluno>] [--check]   recria (ou só confere) retomada.md e PROGRESS.md
//   node academia/ferramentas/academia.mjs sessao <aluno> [--etapa N] [--data AAAA-MM-DD]
//   node academia/ferramentas/academia.mjs kit <aluno>                 texto para colar numa conversa com um assistente
//   node academia/ferramentas/academia.mjs novo-aluno <slug> "Nome"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acharSegredos, ehPrincipal } from './comum.mjs';

const RAIZ_PADRAO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------------------------------------------
// Constantes das regras que o código impõe (os valores numéricos de XP, níveis etc. vêm das tabelas dos documentos)
// ---------------------------------------------------------------------------------------------------------------
const TITULOS_LICAO = [
  'Identificação e pré-requisitos', 'Objetivos de aprendizagem', 'Duração estimada', 'Microlição',
  'Material complementar', 'Exemplos práticos', 'Quiz de fixação', 'Desafio hands-on', 'Critérios de aceitação',
  'Rubrica de avaliação', 'Dicas graduais', 'Modelo de relatório do aluno', 'Competências registradas',
  'Referências e última revisão', 'Aplicação, reforço e desafios',
];
// A seção 15 tem cinco blocos fixos. O 15.2 traz as perguntas de revisão V1..V5 (a correção fica no gabarito.md).
const SUBTITULOS_15 = [
  'Onde isso aparece no trabalho', 'Reforço (revisão espaçada)', 'Desafio de transferência',
  'Ponte com o projeto e com a prática', 'Calibragem',
];
const MIN_PERGUNTAS_REVISAO = 5;
const STATUS_ETAPA = ['em-andamento', 'pausada', 'concluida'];
const RESULTADOS = ['aprovado', 'parcial', 'reprovado'];
const TIPO_POR_SUFIXO = { quiz: 'quiz', lab: 'laboratorio', explicacao: 'explicacao' };
const REGRAS_CONTADOR = ['xp', 'revisoes', 'opcionais', 'explicacoes', 'retomadas'];
const MAX_OPCIONAIS = 3; // por etapa (documentado em GAMIFICACAO.md)
const DIAS_PAUSA = 14; // "voltar de uma pausa" (documentado em GAMIFICACAO.md)
const MIN_BYTES_EVIDENCIA = 20;
const SLUGS_RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const NOME_SESSAO = /^(\d{4}-\d{2}-\d{2})-s(\d{2,})\.md$/;

// ---------------------------------------------------------------------------------------------------------------
// Leitura de Markdown (tolerante a CRLF e BOM: no Windows o Git e o Bloco de Notas costumam introduzi-los)
// ---------------------------------------------------------------------------------------------------------------
export const lerTexto = (arquivo) => fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const chave = (s) => semAcento(String(s)).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const limpar = (s) => String(s ?? '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '').trim();
/** Inteiro estrito: '' , ' ', '1.5' e 'abc' viram NaN (Number('') seria 0). */
export const inteiro = (s) => (/^\s*-?\d+\s*$/.test(String(s ?? '')) ? Number(s) : NaN);
const dataValida = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const celula = (s) => String(s ?? '').replace(/[|[\]]/g, ' ').replace(/\s+/g, ' ').trim();
const semLinksRelativos = (t) => t.replace(/\[([^\]]*)\]\((?!https?:)[^)]*\)/g, '$1');

export function frontMatter(texto) {
  const linhas = texto.split('\n');
  if (linhas[0].trim() !== '---') return { dados: {}, corpo: texto, tem: false };
  const fim = linhas.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (fim < 0 || fim > 60) return { dados: {}, corpo: texto, tem: false };
  const dados = {};
  for (const linha of linhas.slice(1, fim)) {
    const k = linha.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (k) dados[k[1]] = k[2].trim().replace(/^["']|["']$/g, '');
  }
  return { dados, corpo: linhas.slice(fim + 1).join('\n'), tem: true };
}

/** Divide o texto em seções "## Título" (ignora blocos de código). Chave = título normalizado. */
export function secoes(texto) {
  const mapa = new Map();
  mapa.duplicadas = [];
  let atual = null;
  let cerca = false;
  for (const linha of texto.split('\n')) {
    if (/^\s*```/.test(linha)) cerca = !cerca;
    const h = !cerca && linha.match(/^##\s+(.*?)\s*$/);
    if (h) {
      const k = chave(h[1]);
      if (mapa.has(k)) mapa.duplicadas.push(h[1]);
      atual = { titulo: h[1], linhas: [] };
      mapa.set(k, atual);
    } else if (atual) atual.linhas.push(linha);
  }
  return mapa;
}

const ehSeparador = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

/**
 * Primeira tabela Markdown das linhas dadas -> lista de objetos (chaves normalizadas), ou null se não houver.
 * `lista.problemas` traz defeitos que normalmente passariam em silêncio (sem separador, linhas após uma linha em branco).
 */
export function tabela(linhas, { unica = false } = {}) {
  const bloco = [];
  let comecou = false;
  let fimDoBloco = -1;
  linhas.forEach((l, i) => {
    if (/^\s*\|/.test(l)) {
      comecou = true;
      if (fimDoBloco < 0) bloco.push(l);
    } else if (comecou && fimDoBloco < 0) fimDoBloco = i;
  });
  if (!bloco.length) return null;
  const celulas = (l) => l.trim().replace(/\\\|/g, '\u0001').replace(/^\|/, '').replace(/\|$/, '')
    .split('|').map((c) => c.replace(/\u0001/g, '|').trim());
  const problemas = [];
  const temSeparador = bloco.length >= 2 && ehSeparador(bloco[1]);
  if (!temSeparador) problemas.push('falta a linha separadora (|---|---|) logo abaixo do cabeçalho');
  if (unica && fimDoBloco >= 0 && linhas.slice(fimDoBloco).some((l) => /^\s*\|/.test(l))) {
    problemas.push('há linhas de tabela depois de uma linha em branco (seriam ignoradas); remova a linha em branco');
  }
  const cab = celulas(bloco[0]).map(chave);
  const dados = bloco.slice(temSeparador ? 2 : 1).map((l) => {
    const c = celulas(l);
    return Object.fromEntries(cab.map((k, i) => [k, c[i] ?? '']));
  });
  dados.problemas = problemas;
  return dados;
}

const textoDe = (sec) => (sec ? sec.linhas.filter((l) => !l.startsWith('>')).join('\n').trim() : '');

/** Slug de títulos como o GitHub gera (para conferir âncoras de links). */
export function slug(titulo) {
  return limpar(titulo).toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
}
function ancoras(texto) {
  const contagem = new Map();
  const saida = new Set();
  let cerca = false;
  for (const l of texto.split('\n')) {
    if (/^\s*```/.test(l)) cerca = !cerca;
    const h = !cerca && l.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!h) continue;
    const base = slug(h[1]);
    const n = contagem.get(base) ?? 0;
    contagem.set(base, n + 1);
    saida.add(n === 0 ? base : `${base}-${n}`);
  }
  return saida;
}

/** Existência com diferenciação de maiúsculas/minúsculas, como no GitHub (o Windows e o macOS não diferenciam). */
function criarExiste(raiz) {
  const cache = new Map();
  const nomes = (dir) => {
    if (!cache.has(dir)) {
      try { cache.set(dir, new Set(fs.readdirSync(dir))); } catch { cache.set(dir, null); }
    }
    return cache.get(dir);
  };
  return (abs) => {
    const rel = path.relative(raiz, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return fs.existsSync(abs);
    let dir = raiz;
    for (const seg of rel.split(path.sep).filter(Boolean)) {
      const ls = nomes(dir);
      if (!ls || !ls.has(seg)) return false;
      dir = path.join(dir, seg);
    }
    return true;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Configuração: lida das tabelas dos documentos
// ---------------------------------------------------------------------------------------------------------------
export function carregarConfig(raiz) {
  const erros = [];
  const ac = path.join(raiz, 'academia');
  const faltando = new Set();
  const f = (mensagem, arquivo = 'academia/GAMIFICACAO.md') => erros.push({ arquivo, mensagem });
  const ler = (arquivo, secao, colunas) => {
    const caminho = path.join(ac, arquivo);
    if (!fs.existsSync(caminho)) {
      if (!faltando.has(arquivo)) { faltando.add(arquivo); f('arquivo não encontrado', `academia/${arquivo}`); }
      return [];
    }
    const sec = secoes(lerTexto(caminho)).get(chave(secao));
    const t = sec ? tabela(sec.linhas) : null;
    if (!t) { f(`falta a tabela da seção "## ${secao}"`, `academia/${arquivo}`); return []; }
    for (const p of t.problemas) f(`tabela "${secao}": ${p}`, `academia/${arquivo}`);
    for (const c of colunas) if (t.length && !(c in t[0])) f(`a tabela de "${secao}" precisa da coluna "${c}"`, `academia/${arquivo}`);
    return t;
  };

  const xp = {};
  for (const l of ler('GAMIFICACAO.md', 'XP', ['tipo', 'xp'])) {
    const n = inteiro(l.xp);
    if (!Number.isInteger(n) || n <= 0) f(`XP inválido para ${l.tipo}`);
    xp[limpar(l.tipo)] = n;
  }
  const checkpoints = ler('GAMIFICACAO.md', 'Checkpoints de domínio', ['id', 'fase', 'apos_a_etapa']).map((l) => ({
    id: limpar(l.id), fase: inteiro(l.fase), apos: inteiro(l.apos_a_etapa),
  }));
  const niveis = ler('GAMIFICACAO.md', 'Níveis', ['nivel', 'xp_minimo', 'checkpoints_exigidos']).map((l) => {
    const bruto = limpar(l.checkpoints_exigidos);
    const itens = /^[—–-]?$/.test(bruto) ? [] : bruto.split(',').map((s) => s.trim());
    const ruins = itens.filter((s) => !/^CP\d+$/.test(s));
    if (ruins.length) f(`nível ${limpar(l.nivel)}: checkpoint(s) mal escrito(s): ${ruins.join(', ')} (use CP1, CP2...)`);
    return { nome: limpar(l.nivel), xpMin: inteiro(l.xp_minimo), checkpoints: itens.filter((s) => /^CP\d+$/.test(s)) };
  });
  const conquistas = ler('GAMIFICACAO.md', 'Conquistas', ['id', 'conquista', 'regra']).map((l) => ({
    id: limpar(l.id), nome: limpar(l.conquista), regra: limpar(l.regra), descricao: limpar(l.descricao ?? ''),
  }));
  const revisoes = ler('GAMIFICACAO.md', 'Revisão espaçada', ['revisao', 'sessoes_apos_a_conclusao'])
    .map((l) => inteiro(l.sessoes_apos_a_conclusao));
  const competencias = ler('competencias.md', 'Catálogo', ['id', 'competencia', 'etapa', 'fase']).map((l) => ({
    id: limpar(l.id), texto: limpar(l.competencia), etapa: inteiro(l.etapa), fase: inteiro(l.fase),
  }));
  const etapas = ler('ROADMAP.md', 'Visão geral', ['etapa', 'fase', 'titulo', 'licao', 'status']).map((l) => ({
    n: inteiro(l.etapa), fase: inteiro(l.fase), titulo: limpar(l.titulo), licao: (l.licao.match(/\]\(([^)]+)\)/) ?? [])[1] ?? null,
    status: limpar(l.status),
  }));

  // consistência da configuração
  for (const t of ['quiz', 'laboratorio', 'explicacao', 'revisao', 'opcional']) if (!(t in xp)) f(`falta o tipo de XP "${t}"`);
  if (!niveis.length || niveis[0].xpMin !== 0) f('o primeiro nível deve ter XP mínimo 0');
  niveis.forEach((n, i) => {
    if (!Number.isInteger(n.xpMin)) f(`XP mínimo inválido no nível ${n.nome}`);
    if (i && n.xpMin < niveis[i - 1].xpMin) f('os níveis devem estar em ordem crescente de XP');
    for (const c of n.checkpoints) if (!checkpoints.some((k) => k.id === c)) f(`nível ${n.nome} exige checkpoint inexistente: ${c}`);
  });
  if (etapas.length !== 16 || etapas.some((e, i) => e.n !== i + 1)) f('o ROADMAP precisa listar as etapas 1 a 16, em ordem', 'academia/ROADMAP.md');
  etapas.forEach((e, i) => {
    if (!(e.fase >= 1 && e.fase <= 5) || (i && e.fase < etapas[i - 1].fase)) f(`fase inválida na etapa ${e.n}`, 'academia/ROADMAP.md');
    if (!['pronta', 'roteiro'].includes(e.status)) f(`status inválido na etapa ${e.n}: ${e.status}`, 'academia/ROADMAP.md');
  });
  const idsComp = new Set();
  for (const c of competencias) {
    if (!/^C\d{2}$/.test(c.id) || idsComp.has(c.id)) f(`ID de competência inválido ou repetido: ${c.id}`, 'academia/competencias.md');
    idsComp.add(c.id);
    const e = etapas.find((x) => x.n === c.etapa);
    if (!e) f(`${c.id} aponta uma etapa inexistente (${c.etapa})`, 'academia/competencias.md');
    else if (e.fase !== c.fase) f(`${c.id}: fase ${c.fase} não confere com a etapa ${c.etapa} (fase ${e.fase})`, 'academia/competencias.md');
  }
  for (const e of etapas) if (!competencias.some((c) => c.etapa === e.n)) f(`a etapa ${e.n} não tem competência no catálogo`, 'academia/competencias.md');
  for (const k of checkpoints) {
    if (!/^CP\d+$/.test(k.id) || !etapas.some((e) => e.n === k.apos && e.fase === k.fase)) f(`checkpoint ${k.id}: etapa/fase inconsistentes com o ROADMAP`);
  }
  if (!checkpoints.some((k) => k.apos === 16)) f('falta o checkpoint da etapa 16');
  if (!revisoes.length || revisoes.some((n, i) => !Number.isInteger(n) || n < 1 || (i && n <= revisoes[i - 1]))) f('intervalos de revisão devem ser inteiros crescentes');
  const ids = new Set();
  for (const c of conquistas) {
    if (ids.has(c.id)) f(`conquista repetida: ${c.id}`);
    ids.add(c.id);
    const erro = regraInvalida(c.regra, { competencias: idsComp, checkpoints: new Set(checkpoints.map((k) => k.id)) });
    if (erro) f(`conquista ${c.id}: ${erro}`);
  }
  return { erros, config: { xp, niveis, checkpoints, conquistas, revisoes, competencias, etapas } };
}

function regraInvalida(regra, { competencias, checkpoints }) {
  let m;
  if ((m = regra.match(/^ativ:(E\d{2}-[\w-]+)$/))) return null;
  if ((m = regra.match(/^cp:(CP\d+)$/))) return checkpoints.has(m[1]) ? null : `checkpoint inexistente (${m[1]})`;
  if ((m = regra.match(/^comp:([A-Z0-9,]+)>=([0-3])$/))) {
    const falta = m[1].split(',').find((c) => !competencias.has(c));
    return falta ? `competência inexistente (${falta})` : null;
  }
  if ((m = regra.match(/^([a-z]+)>=(\d+)$/)) && REGRAS_CONTADOR.includes(m[1])) return null;
  return `regra desconhecida "${regra}"`;
}

export function avaliarRegra(regra, ctx) {
  let m;
  if ((m = regra.match(/^ativ:(.+)$/))) return ctx.ativ.has(m[1]);
  if ((m = regra.match(/^cp:(.+)$/))) return ctx.cps.has(m[1]);
  if ((m = regra.match(/^comp:([A-Z0-9,]+)>=([0-3])$/))) return m[1].split(',').every((c) => (ctx.comp.get(c) ?? 0) >= Number(m[2]));
  if ((m = regra.match(/^([a-z]+)>=(\d+)$/))) return (ctx[m[1]] ?? 0) >= Number(m[2]);
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Alunos e sessões
// ---------------------------------------------------------------------------------------------------------------
export function listarAlunos(raiz) {
  const dir = path.join(raiz, 'academia', 'alunos');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && fs.existsSync(path.join(dir, d.name, 'perfil.md')))
    .map((d) => d.name).sort();
}

/** Pastas em alunos/ que não são alunos de verdade (sem perfil.md): se ignoradas em silêncio, o aluno "some". */
export function pastasSemPerfil(raiz) {
  const dir = path.join(raiz, 'academia', 'alunos');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !fs.existsSync(path.join(dir, d.name, 'perfil.md')))
    .map((d) => ({ arquivo: `academia/alunos/${d.name}`, mensagem: 'pasta de aluno sem perfil.md (crie o perfil ou remova a pasta)' }));
}

// Evidência válida: texto objetivo com pelo menos 8 letras/números (não vale "ok", "...", "TODO", "sem evidência").
const temEvidencia = (c) => {
  const t = limpar(c).replace(/\s+/g, ' ');
  return (t.match(/[\p{L}\p{N}]/gu) ?? []).length >= 8 && !/^(sem evid|todo|tbd|n\/a|nada|preencher|-+$)/i.test(t);
};
const parecesCaminho = (p) => /[\\/]/.test(p) || /\.(md|mjs|cjs|js|ts|tsx|json|txt|py|csv|log|png|jpe?g|svg|yml|yaml|sh)$/i.test(p);

function lerSessao(arquivo, rel, slugAluno, config) {
  const erros = [];
  const e = (mensagem) => erros.push({ arquivo: rel, mensagem });
  const texto = lerTexto(arquivo);
  const { dados, corpo, tem } = frontMatter(texto);
  const nm = path.basename(arquivo).match(NOME_SESSAO);
  if (!tem) e('falta o front matter (--- ... --- no começo do arquivo)');
  if (dados.aluno !== slugAluno) e(`aluno "${dados.aluno}" não confere com a pasta "${slugAluno}"`);
  if (!dataValida(dados.data)) e('data inválida (AAAA-MM-DD)');
  else if (nm && nm[1] !== dados.data) e(`a data do nome (${nm[1]}) não confere com a do front matter (${dados.data})`);
  const numero = inteiro(dados.sessao);
  if (!Number.isInteger(numero) || numero < 1) e('`sessao` deve ser um inteiro >= 1');
  else if (nm && Number(nm[2]) !== numero) e(`o número do nome (s${nm[2]}) não confere com sessao: ${dados.sessao}`);
  const etapa = inteiro(dados.etapa);
  if (!Number.isInteger(etapa) || etapa < 0 || etapa > config.etapas.length) e('`etapa` deve ser um inteiro de 0 a 16');
  if (!STATUS_ETAPA.includes(dados.status_etapa)) e(`status_etapa deve ser: ${STATUS_ETAPA.join(', ')}`);
  if (!['sim', 'nao'].includes(dados.retomada)) e('retomada deve ser "sim" ou "nao"');

  const sec = secoes(corpo);
  for (const d of sec.duplicadas) e(`seção duplicada: "## ${d}" (a segunda esconderia a primeira)`);
  const tab = (titulo, colunas) => {
    const t = tabela(sec.get(chave(titulo))?.linhas ?? [], { unica: true });
    if (!t) { e(`falta a tabela da seção "## ${titulo}"`); return []; }
    for (const p of t.problemas) e(`tabela "${titulo}": ${p}`);
    if (t.length) for (const c of colunas) if (!(c in t[0])) e(`a tabela "${titulo}" precisa da coluna "${c}"`);
    return t;
  };
  const atividades = tab('Atividades', ['id', 'tipo', 'tentativa', 'resultado', 'evidencia', 'xp']);
  const competencias = tab('Competências', ['id', 'nivel', 'evidencia']);
  const checkpoints = tab('Checkpoints', ['id', 'resultado', 'evidencia']);
  const pendencias = textoDe(sec.get('pendencias')).split('\n').map((l) => l.match(/^-\s+(.*)/)?.[1]).filter((l) => l && !/^nenhuma\.?$/i.test(l));
  return {
    erros,
    sessao: {
      arquivo: rel, nome: path.basename(arquivo), data: dados.data, numero, etapa, status: dados.status_etapa,
      retomada: dados.retomada === 'sim', atividades, competencias, checkpoints, pendencias,
      resumo: textoDe(sec.get('resumo')), feedback: textoDe(sec.get('feedback')), proxima: textoDe(sec.get('proxima_missao')),
    },
  };
}

/** Aplica as sessões em ordem e devolve o estado do aluno e os erros de consistência. */
export function analisarAluno(raiz, slugAluno, config) {
  const dirAluno = path.join(raiz, 'academia', 'alunos', slugAluno);
  const relAluno = `academia/alunos/${slugAluno}`;
  const erros = [];
  const existe = criarExiste(raiz);
  const { dados: perfil, corpo: perfilCorpo } = frontMatter(lerTexto(path.join(dirAluno, 'perfil.md')));
  // A Missão 0 (CA4) exige o perfil preenchido para valer o E00-lab.
  const secPerfil = secoes(perfilCorpo);
  const faltaNoPerfil = [];
  if (!perfil.ritmo) faltaNoPerfil.push('ritmo (no front matter)');
  for (const [k, titulo] of [['objetivo_com_o_curso', 'Objetivo com o curso'], ['ponto_de_partida', 'Ponto de partida'], ['preferencias_de_estudo', 'Preferências de estudo'], ['ambiente', 'Ambiente']]) {
    if ((textoDe(secPerfil.get(k)).match(/[\p{L}\p{N}]/gu) ?? []).length < 20) faltaNoPerfil.push(titulo);
  }
  const ep = (mensagem) => erros.push({ arquivo: `${relAluno}/perfil.md`, mensagem });
  if (perfil.slug !== slugAluno) ep(`slug "${perfil.slug}" não confere com a pasta "${slugAluno}"`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slugAluno) || SLUGS_RESERVADOS.test(slugAluno)) ep('nome de pasta inválido (minúsculas, números e hífen; sem nomes reservados do Windows)');
  if (!perfil.nome) ep('falta `nome` no front matter');
  if (!['sim', 'nao'].includes(perfil.compartilhar_xp)) ep('`compartilhar_xp` deve ser "sim" ou "nao"');

  // arquivos de sessão
  const dirSessoes = path.join(dirAluno, 'sessoes');
  let entradas = [];
  try { entradas = fs.readdirSync(dirSessoes, { withFileTypes: true }); } catch { /* sem sessões ainda */ }
  const sessoes = [];
  for (const ent of entradas.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (ent.name.startsWith('.')) continue;
    const rel = `${relAluno}/sessoes/${ent.name}`;
    if (!ent.isFile()) { erros.push({ arquivo: rel, mensagem: 'em sessoes/ só cabem arquivos AAAA-MM-DD-sNN.md' }); continue; }
    if (!NOME_SESSAO.test(ent.name)) { erros.push({ arquivo: rel, mensagem: 'nome inválido: use AAAA-MM-DD-sNN.md (minúsculas); este arquivo seria ignorado' }); continue; }
    const r = lerSessao(path.join(dirSessoes, ent.name), rel, slugAluno, config);
    erros.push(...r.erros);
    sessoes.push(r.sessao);
  }
  sessoes.sort((a, b) => (a.numero || 0) - (b.numero || 0));
  sessoes.forEach((s, i) => {
    const prev = sessoes[i - 1];
    if (Number.isInteger(s.numero) && s.numero !== i + 1 && !(prev && s.numero === prev.numero)) {
      erros.push({ arquivo: s.arquivo, mensagem: `numeração fora de sequência: esperado s${String(i + 1).padStart(2, '0')}` });
    }
    if (prev && s.numero === prev.numero) erros.push({ arquivo: s.arquivo, mensagem: `número de sessão repetido (${s.numero})` });
    if (prev && dataValida(s.data) && dataValida(prev.data) && Date.parse(s.data) < Date.parse(prev.data)) {
      erros.push({ arquivo: s.arquivo, mensagem: 'data anterior à da sessão anterior' });
    }
  });

  const est = {
    slug: slugAluno, nome: perfil.nome ?? slugAluno, compartilharXp: perfil.compartilhar_xp === 'sim', xp: 0,
    atividades: new Map(), competencias: new Map(), checkpoints: new Map(), concluidas: new Map(), conquistas: new Map(),
    revisoesFeitas: new Map(), contagens: { revisoes: 0, opcionais: 0, explicacoes: 0, retomadas: 0 }, sessoes,
    xpPorSessao: new Map(), pendenciasAtividades: [],
  };
  const contexto = () => ({
    xp: est.xp, ativ: new Set([...est.atividades].filter(([, a]) => a.aprovada).map(([id]) => id)),
    comp: new Map([...est.competencias].map(([id, c]) => [id, c.nivel])), cps: new Set(est.checkpoints.keys()), ...est.contagens,
  });
  const nivelDaFase = (fase) => config.competencias.filter((c) => c.fase === fase).every((c) => (est.competencias.get(c.id)?.nivel ?? 0) >= 2);

  /** Caminhos de evidência citados entre crases: devolve os que existem (dentro da pasta do aluno) e os problemas. */
  const avaliarCaminhos = (celulaEvidencia) => {
    const validos = [];
    const problemas = [];
    for (const m of String(celulaEvidencia ?? '').matchAll(/`([^`]+)`/g)) {
      const p = m[1].trim();
      if (!parecesCaminho(p)) continue;
      if (p.includes('\\')) { problemas.push(`use "/" no caminho "${p}"`); continue; }
      if (path.isAbsolute(p) || p.split('/').includes('..')) { problemas.push(`o caminho "${p}" sai da pasta do aluno (evidência só vale dentro de ${relAluno}/)`); continue; }
      const abs = path.join(dirAluno, p);
      if (!existe(abs)) { problemas.push(`evidência não encontrada: ${p}`); continue; }
      const st = fs.statSync(abs);
      if (!st.isFile()) { problemas.push(`aponte um arquivo, não uma pasta: ${p}`); continue; }
      if (st.size < MIN_BYTES_EVIDENCIA) { problemas.push(`arquivo de evidência quase vazio: ${p}`); continue; }
      validos.push(p);
    }
    return { validos, problemas };
  };

  sessoes.forEach((s, idx) => {
    const e = (mensagem) => erros.push({ arquivo: s.arquivo, mensagem });
    const prev = sessoes[idx - 1];
    let ganho = 0;
    const etapaOk = Number.isInteger(s.etapa) && s.etapa >= 0 && s.etapa <= config.etapas.length;

    if (s.retomada) {
      const dias = prev && dataValida(s.data) && dataValida(prev.data) ? (Date.parse(s.data) - Date.parse(prev.data)) / 86_400_000 : -1;
      if (!prev || dias < DIAS_PAUSA) e(`retomada: sim exige uma sessão anterior e ${DIAS_PAUSA} dias ou mais de pausa`);
      else est.contagens.retomadas += 1;
    }

    for (const a of s.atividades) {
      const id = limpar(a.id);
      let m;
      let etapaId;
      let esperado;
      let n = 0;
      if ((m = id.match(/^E(\d{2})-(quiz|lab|explicacao)$/))) { etapaId = Number(m[1]); esperado = TIPO_POR_SUFIXO[m[2]]; }
      else if ((m = id.match(/^E(\d{2})-opcional-([1-9]\d*)$/))) { etapaId = Number(m[1]); esperado = 'opcional'; n = Number(m[2]); }
      else if ((m = id.match(/^R(\d{2})-([1-9]\d*)$/))) { etapaId = Number(m[1]); esperado = 'revisao'; n = Number(m[2]); }
      else { e(`id de atividade inválido: "${id}" (convenção em GAMIFICACAO.md; sem zeros à esquerda no número)`); continue; }
      if (etapaId > config.etapas.length) { e(`${id}: etapa inexistente`); continue; }

      let ok = true;
      const falha = (mensagem) => { e(`${id}: ${mensagem}`); ok = false; };
      const tipo = limpar(a.tipo);
      if (tipo !== esperado) falha(`tipo "${tipo}" não confere com o id (esperado "${esperado}")`);
      if (!(tipo in config.xp)) { e(`${id}: tipo de XP desconhecido ("${tipo}")`); continue; }
      const tentativa = inteiro(a.tentativa);
      if (!Number.isInteger(tentativa) || tentativa < 1) falha('tentativa deve ser um inteiro >= 1');
      const resultado = limpar(a.resultado);
      if (!RESULTADOS.includes(resultado)) { e(`${id}: resultado deve ser ${RESULTADOS.join(', ')}`); continue; }
      const xp = inteiro(a.xp);
      if (!Number.isInteger(xp) || xp < 0) { e(`${id}: XP deve ser um inteiro >= 0`); continue; }

      const ja = est.atividades.get(id) ?? { tentativas: 0, aprovada: false, xpConcedido: false, ultimo: null };
      ja.tentativas += 1;
      ja.ultimo = resultado;
      const evid = a.evidencia ?? '';
      const caminhos = avaliarCaminhos(evid);
      if (resultado === 'aprovado') for (const p of caminhos.problemas) falha(p);
      if (id === 'E00-lab' && resultado === 'aprovado' && xp > 0 && faltaNoPerfil.length) {
        falha(`perfil.md incompleto (CA4 da Missão 0): preencha ${faltaNoPerfil.join(', ')}`);
      }

      if (xp > 0) {
        if (resultado !== 'aprovado') falha('XP só pode ser concedido a uma atividade aprovada');
        if (ja.xpConcedido) falha('XP já concedido antes (cada atividade rende XP uma única vez)');
        if (xp !== config.xp[tipo]) falha(`XP ${xp} não confere com a tabela (${tipo} = ${config.xp[tipo]})`);
        if (etapaId > 0 && config.etapas[etapaId - 1].status !== 'pronta') {
          falha(`a etapa ${etapaId} ainda não tem lição pronta no ROADMAP, então não há critério para comprovar o XP`);
        }
        if (tipo === 'revisao') {
          if (!temEvidencia(evid)) falha('XP sem evidência (descreva a prova em pelo menos 8 letras ou números)');
          const quando = est.concluidas.get(etapaId);
          const feitas = est.revisoesFeitas.get(etapaId) ?? 0;
          if (quando === undefined || quando >= s.numero) falha('revisão de uma etapa que não foi concluída em uma sessão anterior');
          else {
            if (n > config.revisoes.length) falha(`só existem ${config.revisoes.length} revisões por etapa`);
            else if (n !== feitas + 1) falha(`a próxima revisão desta etapa é R${String(etapaId).padStart(2, '0')}-${feitas + 1}`);
            else if (s.numero - quando < config.revisoes[n - 1]) falha(`ainda não é devida (faltam ${config.revisoes[n - 1] - (s.numero - quando)} sessão(ões))`);
          }
        } else if (!caminhos.validos.length) {
          falha('XP sem evidência: cite entre crases um arquivo que exista em entregas/ (ex.: `entregas/etapa-01/quiz.md`)');
        }
        if (tipo === 'opcional' && n > MAX_OPCIONAIS) falha(`só existem ${MAX_OPCIONAIS} desafios opcionais por etapa`);
      }

      if (ok && resultado === 'aprovado') ja.aprovada = true;
      if (ok && xp > 0 && resultado === 'aprovado') {
        est.xp += config.xp[tipo];
        ganho += config.xp[tipo];
        ja.xpConcedido = true;
        if (tipo === 'revisao') { est.contagens.revisoes += 1; est.revisoesFeitas.set(etapaId, (est.revisoesFeitas.get(etapaId) ?? 0) + 1); }
        if (tipo === 'opcional') est.contagens.opcionais += 1;
        if (tipo === 'explicacao') est.contagens.explicacoes += 1;
      }
      est.atividades.set(id, ja);
    }

    for (const c of s.competencias) {
      const id = limpar(c.id);
      const nivel = inteiro(c.nivel);
      if (!config.competencias.some((x) => x.id === id)) { e(`competência inexistente: ${id}`); continue; }
      if (!Number.isInteger(nivel) || nivel < 0 || nivel > 3) { e(`${id}: nível deve ser um inteiro de 0 a 3`); continue; }
      if (nivel >= 1 && !temEvidencia(c.evidencia)) { e(`${id}: nível ${nivel} sem evidência`); continue; }
      est.competencias.set(id, { nivel, sessao: s.numero, evidencia: celula(limpar(c.evidencia)) });
    }

    if (s.status === 'concluida' && etapaOk) {
      const nn = String(s.etapa).padStart(2, '0');
      let completa = true;
      for (const exigido of [`E${nn}-quiz`, `E${nn}-lab`]) {
        if (!est.atividades.get(exigido)?.xpConcedido) { e(`etapa ${s.etapa} marcada como concluída sem ${exigido} aprovado (com XP)`); completa = false; }
      }
      if (completa && !est.concluidas.has(s.etapa)) est.concluidas.set(s.etapa, s.numero);
    }

    for (const k of s.checkpoints) {
      const id = limpar(k.id);
      const cfg = config.checkpoints.find((x) => x.id === id);
      if (!cfg) { e(`checkpoint inexistente: ${id}`); continue; }
      const resultado = limpar(k.resultado);
      if (!['aprovado', 'pendente'].includes(resultado)) { e(`${id}: resultado deve ser aprovado ou pendente`); continue; }
      if (resultado !== 'aprovado') continue;
      let ok = true;
      if (!temEvidencia(k.evidencia)) { e(`${id}: aprovado sem evidência`); ok = false; }
      if (!est.concluidas.has(cfg.apos)) { e(`${id}: exige a etapa ${cfg.apos} concluída`); ok = false; }
      if (!nivelDaFase(cfg.fase)) { e(`${id}: exige todas as competências da fase ${cfg.fase} no nível 2 ou mais`); ok = false; }
      if (ok && !est.checkpoints.has(id)) est.checkpoints.set(id, s.numero);
    }

    for (const q of config.conquistas) {
      if (!est.conquistas.has(q.id) && avaliarRegra(q.regra, contexto())) est.conquistas.set(q.id, s.numero);
    }
    est.xpPorSessao.set(s.numero, ganho);
  });

  est.pendenciasAtividades = [...est.atividades].filter(([, a]) => !a.aprovada)
    .map(([id, a]) => ({ id, tentativas: a.tentativas, ultimo: a.ultimo }));
  finalizar(est, config);
  return { estado: est, erros };
}

/** Calcula nível, etapa atual, próxima sessão e revisões sugeridas a partir do estado acumulado. */
function finalizar(est, config) {
  let nivelIdx = 0;
  for (let i = 1; i < config.niveis.length; i++) {
    const n = config.niveis[i];
    if (est.xp >= n.xpMin && n.checkpoints.every((c) => est.checkpoints.has(c))) nivelIdx = i; else break;
  }
  est.nivel = config.niveis[nivelIdx];
  est.proximoNivel = config.niveis[nivelIdx + 1] ?? null;
  est.faltaParaProximo = est.proximoNivel
    ? { xp: Math.max(0, est.proximoNivel.xpMin - est.xp), checkpoints: est.proximoNivel.checkpoints.filter((c) => !est.checkpoints.has(c)) }
    : null;
  est.etapaAtual = 0;
  while (est.etapaAtual <= config.etapas.length && est.concluidas.has(est.etapaAtual)) est.etapaAtual += 1;
  est.ultima = est.sessoes.at(-1) ?? null;
  est.proximaSessao = (Number.isInteger(est.ultima?.numero) ? est.ultima.numero : 0) + 1;
  const total = est.sessoes.length;
  est.revisoesSugeridas = [];
  for (const [etapa, quando] of est.concluidas) {
    if (etapa === 0) continue;
    const feitas = est.revisoesFeitas.get(etapa) ?? 0;
    const intervalo = config.revisoes[feitas];
    const passadas = total - quando;
    if (intervalo !== undefined && passadas >= intervalo) est.revisoesSugeridas.push({ etapa, numero: feitas + 1, atraso: passadas - intervalo });
  }
  est.revisoesSugeridas.sort((a, b) => b.atraso - a.atraso || a.etapa - b.etapa);
}

// ---------------------------------------------------------------------------------------------------------------
// Geração de retomada.md e PROGRESS.md (determinística: nenhuma data de geração)
// ---------------------------------------------------------------------------------------------------------------
const barra = (v, t, larg = 16) => '█'.repeat(Math.round((v / t) * larg)) + '░'.repeat(larg - Math.round((v / t) * larg));
const pontos = (n) => '●'.repeat(n) + '○'.repeat(3 - n);
const tituloEtapa = (n, config) => (n === 0 ? 'Missão 0 · Diagnóstico' : n > config.etapas.length ? 'Curso concluído' : `Etapa ${n} · ${config.etapas[n - 1].titulo}`);

function linkLicaoDe(n, config, base) {
  if (n === 0) return `${base}licoes/00-missao-0-diagnostico/README.md`;
  const e = config.etapas[n - 1];
  return e?.status === 'pronta' && e.licao ? `${base}${e.licao}` : `${base}ROADMAP.md`;
}

export function renderRetomada(est, config) {
  const L = [];
  const concluidasN = [...est.concluidas.keys()].filter((n) => n >= 1).length;
  const nn = String(est.proximaSessao).padStart(2, '0');
  L.push('<!-- Gerado por `node academia/ferramentas/academia.mjs progresso`. Não edite: a fonte são os arquivos de sessoes/. -->');
  L.push(`# Retomada · ${celula(est.nome)}`, '');
  L.push(`**Nível:** ${est.nivel.nome} · **XP:** ${est.xp} · **Etapa atual:** ${tituloEtapa(est.etapaAtual, config)}`, '');
  L.push(`**Próxima sessão:** s${nn} (dados para o relatório: \`aluno: ${est.slug}\`, \`sessao: ${est.proximaSessao}\`)`, '');
  if (est.faltaParaProximo) {
    const f = est.faltaParaProximo;
    const partes = [];
    if (f.xp) partes.push(`${f.xp} XP`);
    if (f.checkpoints.length) partes.push(`checkpoint${f.checkpoints.length > 1 ? 's' : ''} ${f.checkpoints.join(', ')}`);
    L.push(partes.length ? `Para ${est.proximoNivel.nome}: faltam ${partes.join(' e ')}.` : `Tudo pronto para ${est.proximoNivel.nome}.`, '');
  }

  L.push('## Onde parei', '');
  if (!est.ultima) {
    L.push('Nenhuma sessão registrada ainda. Comece pela [Missão 0](../../licoes/00-missao-0-diagnostico/README.md).', '');
  } else {
    const u = est.ultima;
    L.push(`- Última sessão: **${u.data}** (s${String(u.numero).padStart(2, '0')}), etapa ${u.etapa}, status \`${u.status}\`.`);
    L.push(`- Lição: [${tituloEtapa(est.etapaAtual, config)}](${linkLicaoDe(est.etapaAtual, config, '../../')})`);
    if (u.resumo) L.push(`- Resumo: ${semLinksRelativos(u.resumo.split('\n')[0])}`);
    L.push('');
  }

  L.push('## Próxima missão', '');
  L.push(semLinksRelativos(est.ultima?.proxima || (est.ultima ? 'Escolha a próxima atividade da lição atual.' : 'Fazer a Missão 0: perfil, ambiente e diagnóstico.')), '');

  if (est.ultima?.feedback) {
    L.push('## Último feedback', '', ...semLinksRelativos(est.ultima.feedback).split('\n').map((l) => (l ? `> ${l}` : '>')), '');
  }

  L.push('## Pendências', '');
  const pend = [...(est.ultima?.pendencias ?? []).map((p) => `- ${semLinksRelativos(p)}`),
    ...est.pendenciasAtividades.map((p) => `- Atividade \`${p.id}\` sem aprovação (${p.tentativas} tentativa${p.tentativas > 1 ? 's' : ''}, última: ${p.ultimo})`)];
  L.push(...(pend.length ? pend : ['- Nenhuma.']), '');

  L.push('## Revisões sugeridas', '');
  if (!est.revisoesSugeridas.length) L.push('Nenhuma por enquanto.', '');
  else {
    L.push('Comece a sessão por até três delas, respondendo de memória (a revisão não vale ponto se você consultar).', '');
    for (const r of est.revisoesSugeridas) L.push(`- Etapa ${r.etapa} · revisão ${r.numero} (\`R${String(r.etapa).padStart(2, '0')}-${r.numero}\`): ${config.etapas[r.etapa - 1].titulo}`);
    L.push('');
  }

  L.push('## Progresso', '');
  L.push(`Etapas concluídas: \`${barra(concluidasN, 16)}\` ${concluidasN}/16`, '');
  L.push('| Fase | Etapas | Concluídas |', '|---|---|---|');
  for (let f = 1; f <= 5; f++) {
    const doFase = config.etapas.filter((e) => e.fase === f);
    const feitas = doFase.filter((e) => est.concluidas.has(e.n)).length;
    L.push(`| ${f} | ${doFase[0].n}–${doFase.at(-1).n} | \`${barra(feitas, doFase.length, 10)}\` ${feitas}/${doFase.length} |`);
  }
  L.push('');
  if (est.proximoNivel) L.push(`XP até ${est.proximoNivel.nome}: \`${barra(Math.min(est.xp, est.proximoNivel.xpMin), est.proximoNivel.xpMin)}\` ${est.xp}/${est.proximoNivel.xpMin}`, '');

  L.push('## Competências', '');
  L.push('| ID | Competência | Nível | Evidência mais recente |', '|---|---|---|---|');
  for (const c of config.competencias) {
    const r = est.competencias.get(c.id);
    L.push(`| ${c.id} | ${c.texto} | ${r ? `${pontos(r.nivel)} ${r.nivel}` : `${pontos(0)} 0`} | ${r ? `s${String(r.sessao).padStart(2, '0')}: ${r.evidencia}` : '—'} |`);
  }
  L.push('');

  L.push('## Checkpoints e conquistas', '');
  L.push('| Checkpoint | Situação |', '|---|---|');
  for (const k of config.checkpoints) L.push(`| ${k.id} (após a etapa ${k.apos}) | ${est.checkpoints.has(k.id) ? `aprovado na sessão ${est.checkpoints.get(k.id)}` : 'pendente'} |`);
  L.push('');
  const ganhas = config.conquistas.filter((q) => est.conquistas.has(q.id));
  L.push(`Conquistas: ${ganhas.length}/${config.conquistas.length}`, '');
  for (const q of config.conquistas) L.push(`- ${est.conquistas.has(q.id) ? '[x]' : '[ ]'} **${q.nome}** — ${q.descricao}`);
  L.push('');

  L.push('## Histórico recente', '');
  if (!est.sessoes.length) L.push('Sem sessões.', '');
  else {
    L.push('| Sessão | Data | Etapa | Status | XP ganho |', '|---|---|---|---|---|');
    for (const s of est.sessoes.slice(-5).reverse()) L.push(`| [s${String(s.numero).padStart(2, '0')}](sessoes/${s.nome}) | ${s.data} | ${s.etapa} | ${s.status} | ${est.xpPorSessao.get(s.numero) ?? 0} |`);
    L.push('');
  }
  return L.join('\n');
}

const MARCA_INI = '<!-- academia:auto:inicio -->';
const MARCA_FIM = '<!-- academia:auto:fim -->';

export function renderProgresso(estados, config) {
  const L = [MARCA_INI, '<!-- Gerado por `node academia/ferramentas/academia.mjs progresso`. Não edite entre as marcas. -->', ''];
  L.push('## Alunos', '');
  if (!estados.length) L.push('Nenhum aluno cadastrado.', '');
  else {
    L.push('| Aluno | Nível | Etapa atual | Etapas concluídas | XP |', '|---|---|---|---|---|');
    for (const e of estados) {
      const n = [...e.concluidas.keys()].filter((x) => x >= 1).length;
      L.push(`| [${celula(e.nome)}](alunos/${e.slug}/) | ${e.nivel.nome} | ${tituloEtapa(e.etapaAtual, config)} | \`${barra(n, 16, 10)}\` ${n}/16 | ${e.compartilharXp ? e.xp : '—'} |`);
    }
    L.push('');
    L.push('## Por etapa', '', '✅ concluída · ▶ etapa atual · · pendente', '');
    L.push(`| Etapa | Título | ${estados.map((e) => celula(e.nome)).join(' | ')} |`, `|---|---|${estados.map(() => '---').join('|')}|`);
    for (const e of [{ n: 0, titulo: 'Missão 0 · Diagnóstico' }, ...config.etapas]) {
      const cel = estados.map((s) => (s.concluidas.has(e.n) ? '✅' : s.etapaAtual === e.n ? '▶' : '·'));
      L.push(`| ${e.n} | ${e.titulo} | ${cel.join(' | ')} |`);
    }
    L.push('');
  }
  L.push(MARCA_FIM);
  return L.join('\n');
}

const CABECALHO_PROGRESS = `# Progresso

Visão geral dos alunos da Academia, **gerada** a partir dos relatórios de sessão de cada um
([como funciona](SINCRONIZACAO.md) · [regras de XP](GAMIFICACAO.md)). Cada aluno tem registros independentes: o progresso de
um nunca altera o do outro. O XP só aparece para quem escolheu \`compartilhar_xp: sim\` no próprio perfil, e a lista é
alfabética e sem datas: não há ranking.

`;

function montarProgress(raiz, bloco) {
  const arquivo = path.join(raiz, 'academia', 'PROGRESS.md');
  const atual = fs.existsSync(arquivo) ? lerTexto(arquivo) : null;
  const m = atual?.match(new RegExp(`^([\\s\\S]*?)${MARCA_INI}[\\s\\S]*?${MARCA_FIM}([\\s\\S]*)$`));
  return m ? `${m[1]}${bloco}${m[2]}` : `${CABECALHO_PROGRESS}${bloco}\n`;
}

/**
 * Gera (ou só confere) retomada.md e PROGRESS.md. Com `aluno`, só o retomada.md dele entra na conferência/escrita
 * (e o PROGRESS.md só na escrita). Na escrita, se o aluno-alvo tiver erros nos registros, nada é gravado.
 */
export function gerarRegistros(raiz, config, { somenteChecar = false, aluno = null } = {}) {
  const analises = listarAlunos(raiz).map((s) => ({ slug: s, ...analisarAluno(raiz, s, config) }));
  if (aluno && !analises.some((a) => a.slug === aluno)) return { erros: [{ arquivo: `academia/alunos/${aluno}`, mensagem: 'aluno não encontrado' }], estados: [], errosAnalise: [] };
  const alvo = aluno ? analises.filter((a) => a.slug === aluno) : analises;
  const errosAnalise = alvo.flatMap((a) => a.erros);
  if (!somenteChecar && errosAnalise.length) return { erros: errosAnalise, estados: analises.map((a) => a.estado), errosAnalise };

  const saidas = alvo.map((a) => ({ arquivo: path.join(raiz, 'academia', 'alunos', a.slug, 'retomada.md'), texto: renderRetomada(a.estado, config) + '\n' }));
  if (!(somenteChecar && aluno)) {
    saidas.push({ arquivo: path.join(raiz, 'academia', 'PROGRESS.md'), texto: montarProgress(raiz, renderProgresso(analises.map((a) => a.estado), config)) });
  }
  const erros = [];
  for (const s of saidas) {
    const rel = path.relative(raiz, s.arquivo).split(path.sep).join('/');
    const atual = fs.existsSync(s.arquivo) ? lerTexto(s.arquivo) : null;
    if (atual === s.texto) continue;
    if (somenteChecar) erros.push({ arquivo: rel, mensagem: 'desatualizado: rode `node academia/ferramentas/academia.mjs progresso`' });
    else fs.writeFileSync(s.arquivo, s.texto);
  }
  return { erros, estados: analises.map((a) => a.estado), errosAnalise };
}

// ---------------------------------------------------------------------------------------------------------------
// Validação do conteúdo: lições, roadmap, links, segredos
// ---------------------------------------------------------------------------------------------------------------
function andar(dir, aceita, saida = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name === 'node_modules' || d.name === '.git') continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) andar(p, aceita, saida); else if (aceita(d.name)) saida.push(p);
  }
  return saida;
}

function listarMarkdown(raiz) {
  const saida = fs.existsSync(path.join(raiz, 'academia')) ? andar(path.join(raiz, 'academia'), (n) => /\.md$/i.test(n)) : [];
  for (const f of ['AI_CONTEXT.md', 'README.md']) if (fs.existsSync(path.join(raiz, f))) saida.push(path.join(raiz, f));
  return saida;
}

const decodificar = (t) => { try { return decodeURIComponent(t); } catch { return t; } };

export function validarLinks(raiz) {
  const erros = [];
  const existe = criarExiste(raiz);
  const cacheAncoras = new Map();
  const ancorasDe = (arquivo) => {
    if (!cacheAncoras.has(arquivo)) cacheAncoras.set(arquivo, ancoras(lerTexto(arquivo)));
    return cacheAncoras.get(arquivo);
  };
  for (const arquivo of listarMarkdown(raiz)) {
    const rel = path.relative(raiz, arquivo).split(path.sep).join('/');
    let cerca = false;
    lerTexto(arquivo).split('\n').forEach((linha, i) => {
      if (/^\s*```/.test(linha)) { cerca = !cerca; return; }
      if (cerca || linha.length > 4000) return;
      const semCodigo = linha.replace(/`[^`]*`/g, '');
      for (const m of semCodigo.matchAll(/!?\[[^\]\n]{0,300}\]\(([^)\s]{1,500})(?:\s+"[^"]{0,200}")?\)/g)) {
        const alvo = m[1];
        if (/^(https?:|mailto:|#$)/.test(alvo) || alvo.startsWith('<')) continue;
        const [caminho, frag] = alvo.split('#');
        const destino = caminho ? path.resolve(path.dirname(arquivo), decodificar(caminho)) : arquivo;
        if (!existe(destino)) { erros.push({ arquivo: `${rel}:${i + 1}`, mensagem: `link quebrado: ${alvo}` }); continue; }
        if (frag && destino.endsWith('.md') && fs.statSync(destino).isFile() && !ancorasDe(destino).has(decodificar(frag))) {
          erros.push({ arquivo: `${rel}:${i + 1}`, mensagem: `âncora inexistente: ${alvo}` });
        }
      }
    });
  }
  return erros;
}

const BINARIOS = /\.(png|jpe?g|gif|webp|ico|pdf|wav|mp3|mp4|zip|gz|woff2?)$/i;

export function validarSegredos(raiz) {
  const erros = [];
  const arquivos = fs.existsSync(path.join(raiz, 'academia'))
    ? andar(path.join(raiz, 'academia'), (n) => !BINARIOS.test(n) && !/\.test\.mjs$/.test(n))
    : [];
  for (const f of ['AI_CONTEXT.md']) if (fs.existsSync(path.join(raiz, f))) arquivos.push(path.join(raiz, f));
  for (const a of arquivos) {
    let t;
    try { t = fs.readFileSync(a, 'utf8'); } catch { continue; }
    if (t.includes('\0') || t.length > 2_000_000) continue;
    for (const s of acharSegredos(t.replace(/\r\n?/g, '\n'))) {
      erros.push({ arquivo: `${path.relative(raiz, a).split(path.sep).join('/')}:${s.linha}`, mensagem: `possível segredo (${s.nome}); remova e troque a credencial` });
    }
  }
  return erros;
}

export function validarLicoes(raiz, config) {
  const erros = [];
  const dirLicoes = path.join(raiz, 'academia', 'licoes');
  const confere = (arquivo, rel, etapaEsperada) => {
    const e = (mensagem) => erros.push({ arquivo: rel, mensagem });
    const { dados, corpo, tem } = frontMatter(lerTexto(arquivo));
    if (!tem) e('falta o front matter (etapa, titulo, competencias, duracao_min, revisado_em)');
    for (const k of ['etapa', 'titulo', 'competencias', 'duracao_min', 'revisado_em']) if (!(k in dados)) e(`front matter sem "${k}"`);
    if (etapaEsperada !== null && inteiro(dados.etapa) !== etapaEsperada) e(`etapa ${dados.etapa} não confere com o nome da pasta (${etapaEsperada})`);
    if (etapaEsperada !== null && !dataValida(dados.revisado_em)) e('revisado_em deve ser uma data AAAA-MM-DD');
    if (etapaEsperada !== null && etapaEsperada > 0) {
      const declaradas = (dados.competencias ?? '').split(',').map((s) => s.trim()).filter((s) => /^C\d{2}$/.test(s)).sort();
      const doCatalogo = config.competencias.filter((c) => c.etapa === etapaEsperada).map((c) => c.id).sort();
      if (declaradas.join() !== doCatalogo.join()) e(`competencias (${declaradas.join(', ')}) diferem do catálogo para a etapa (${doCatalogo.join(', ')})`);
    }
    const semCodigo = corpo.replace(/^```[\s\S]*?^```/gm, '');
    const titulos = [...semCodigo.matchAll(/^## (\d+)\.\s+(.*?)\s*$/gm)].map((m) => [Number(m[1]), m[2]]);
    TITULOS_LICAO.forEach((t, i) => {
      if (!titulos[i] || titulos[i][0] !== i + 1 || titulos[i][1] !== t) e(`seção ${i + 1} deve ser "## ${i + 1}. ${t}"`);
    });
    if (titulos.length > TITULOS_LICAO.length) e(`a lição tem seções além da ${TITULOS_LICAO.length}ª`);
    // Seção 15: cinco blocos na ordem; a partir da etapa 1, também as perguntas de revisão V1..V5.
    const ini15 = semCodigo.search(/^## 15\./m);
    const sec15 = ini15 < 0 ? '' : semCodigo.slice(ini15).split(/^## (?!15\.)/m)[0];
    const subs = [...sec15.matchAll(/^### 15\.(\d+)\s+(.*?)\s*$/gm)].map((m) => [Number(m[1]), m[2]]);
    SUBTITULOS_15.forEach((t, i) => {
      if (!subs[i] || subs[i][0] !== i + 1 || subs[i][1] !== t) e(`a seção 15 deve ter "### 15.${i + 1} ${t}"`);
    });
    if (subs.length > SUBTITULOS_15.length) e(`a seção 15 tem blocos além do 15.${SUBTITULOS_15.length}`);
    let nRevisao = 0;
    if (etapaEsperada !== null && etapaEsperada > 0) {
      const bloco152 = sec15.split(/^### 15\.3\b/m)[0].split(/^### 15\.2\b/m)[1] ?? '';
      const perguntas = [...bloco152.matchAll(/^\*\*V(\d+)\.\*\*/gm)].map((m) => Number(m[1]));
      if (perguntas.length < MIN_PERGUNTAS_REVISAO || perguntas.some((n, i) => n !== i + 1)) {
        e(`o bloco 15.2 precisa das perguntas de revisão **V1.** a **V${MIN_PERGUNTAS_REVISAO}.** (numeradas em sequência, no início da linha)`);
      } else nRevisao = perguntas.length;
    }
    return nRevisao;
  };

  const tmpl = path.join(raiz, 'academia', 'templates', 'licao.md');
  if (fs.existsSync(tmpl)) confere(tmpl, 'academia/templates/licao.md', null);
  else erros.push({ arquivo: 'academia/templates/licao.md', mensagem: 'template de lição não encontrado' });

  const pastas = fs.existsSync(dirLicoes) ? fs.readdirSync(dirLicoes, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  const existentes = new Set();
  for (const nome of pastas) {
    const m = nome.match(/^(\d{2})-/);
    const rel = `academia/licoes/${nome}/README.md`;
    if (!m) { erros.push({ arquivo: `academia/licoes/${nome}`, mensagem: 'a pasta da lição deve começar com NN-' }); continue; }
    if (!fs.existsSync(path.join(dirLicoes, nome, 'README.md'))) { erros.push({ arquivo: rel, mensagem: 'lição sem README.md' }); continue; }
    existentes.add(Number(m[1]));
    const nRevisao = confere(path.join(dirLicoes, nome, 'README.md'), rel, Number(m[1]));
    const gab = path.join(dirLicoes, nome, 'gabarito.md');
    if (!fs.existsSync(gab)) erros.push({ arquivo: `academia/licoes/${nome}`, mensagem: 'falta gabarito.md (o gabarito do quiz fica separado)' });
    else if (nRevisao) {
      const comentadas = new Set([...lerTexto(gab).matchAll(/^## V(\d+)\b/gm)].map((x) => Number(x[1])));
      for (let n = 1; n <= nRevisao; n++) {
        if (!comentadas.has(n)) erros.push({ arquivo: `academia/licoes/${nome}/gabarito.md`, mensagem: `falta a correção da pergunta de revisão V${n} ("## V${n} · ...")` });
      }
    }
  }
  for (const e of config.etapas) {
    const rel = 'academia/ROADMAP.md';
    if (e.status === 'pronta') {
      if (!existentes.has(e.n)) erros.push({ arquivo: rel, mensagem: `etapa ${e.n} marcada como pronta, mas não há pasta de lição` });
      if (!e.licao) erros.push({ arquivo: rel, mensagem: `etapa ${e.n} marcada como pronta, mas sem link da lição` });
    } else if (existentes.has(e.n)) erros.push({ arquivo: rel, mensagem: `a lição da etapa ${e.n} existe: marque a etapa como "pronta"` });
  }
  if (!existentes.has(0)) erros.push({ arquivo: 'academia/licoes', mensagem: 'falta a Missão 0' });

  // O ROADMAP detalha as competências de cada etapa: precisam bater com o catálogo.
  const rm = path.join(raiz, 'academia', 'ROADMAP.md');
  if (fs.existsSync(rm)) {
    let etapa = null;
    const vistas = new Set();
    for (const l of lerTexto(rm).split('\n')) {
      const h = l.match(/^### Etapa (\d+)\b/);
      if (h) { etapa = Number(h[1]); vistas.add(etapa); continue; }
      const c = etapa && l.match(/^- \*\*Competências:\*\*\s*(.*)$/);
      if (c) {
        const doRoadmap = [...c[1].matchAll(/C\d{2}/g)].map((x) => x[0]).sort();
        const doCatalogo = config.competencias.filter((x) => x.etapa === etapa).map((x) => x.id).sort();
        if (doRoadmap.join() !== doCatalogo.join()) erros.push({ arquivo: 'academia/ROADMAP.md', mensagem: `etapa ${etapa}: competências (${doRoadmap.join(', ')}) diferem do catálogo (${doCatalogo.join(', ')})` });
      }
    }
    for (let n = 1; n <= config.etapas.length; n++) if (!vistas.has(n)) erros.push({ arquivo: 'academia/ROADMAP.md', mensagem: `falta a seção "### Etapa ${n}"` });
  }
  return erros;
}

/** Validação completa. Com `aluno`, só os registros e o retomada.md desse aluno entram (o outro aluno nunca bloqueia). */
export function validarTudo(raiz, { aluno = null } = {}) {
  const { erros: errosCfg, config } = carregarConfig(raiz);
  const erros = [...errosCfg];
  if (errosCfg.length) return { erros, avisos: [], config };
  try {
    erros.push(...validarLicoes(raiz, config));
    const slugs = listarAlunos(raiz);
    if (aluno && !slugs.includes(aluno)) erros.push({ arquivo: `academia/alunos/${aluno}`, mensagem: 'aluno não encontrado (precisa de perfil.md)' });
    if (!aluno) erros.push(...pastasSemPerfil(raiz));
    for (const a of aluno ? slugs.filter((s) => s === aluno) : slugs) erros.push(...analisarAluno(raiz, a, config).erros);
    erros.push(...validarLinks(raiz), ...validarSegredos(raiz));
    if (!aluno || slugs.includes(aluno)) erros.push(...gerarRegistros(raiz, config, { somenteChecar: true, aluno }).erros);
  } catch (err) {
    erros.push({ arquivo: 'academia/ferramentas/academia.mjs', mensagem: `falha inesperada durante a validação: ${err.message}` });
  }
  return { erros, avisos: [], config };
}

// ---------------------------------------------------------------------------------------------------------------
// Comandos que criam arquivos ou textos
// ---------------------------------------------------------------------------------------------------------------
export function criarSessao(raiz, config, slugAluno, { etapa, data } = {}) {
  if (!listarAlunos(raiz).includes(slugAluno)) throw new Error(`aluno "${slugAluno}" não encontrado em academia/alunos/ (use novo-aluno)`);
  const { estado } = analisarAluno(raiz, slugAluno, config);
  const numero = estado.proximaSessao;
  const dia = data ?? new Date().toLocaleDateString('sv-SE');
  if (!dataValida(dia)) throw new Error('a data deve ser uma data real no formato AAAA-MM-DD');
  const nome = `${dia}-s${String(numero).padStart(2, '0')}.md`;
  const dir = path.join(raiz, 'academia', 'alunos', slugAluno, 'sessoes');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, nome);
  if (fs.existsSync(arquivo)) throw new Error(`${nome} já existe`);
  const et = etapa ?? Math.min(estado.etapaAtual, config.etapas.length);
  fs.writeFileSync(arquivo, [
    '---', `aluno: ${slugAluno}`, `data: ${dia}`, `sessao: ${numero}`, `etapa: ${et}`, 'status_etapa: em-andamento',
    'retomada: nao', 'assistente: ', '---', '',
    `# Sessão ${numero} · ${dia} · Etapa ${et}`, '',
    '> Cole aqui o relatório gerado pelo assistente (modelo: academia/templates/relatorio-sessao.md), substituindo o',
    `> conteúdo todo. Confira se \`sessao\` e \`data\` do front matter batem com o nome do arquivo. \`retomada: sim\` só com ${DIAS_PAUSA} dias`,
    '> ou mais desde a sessão anterior. Apague estes comentários.', '',
    '## Resumo', '', '## Atividades', '',
    '| id | tipo | tentativa | resultado | evidência | XP |', '|---|---|---|---|---|---|', '',
    '## Competências', '', '| id | nível | evidência |', '|---|---|---|', '',
    '## Checkpoints', '', '| id | resultado | evidência |', '|---|---|---|', '',
    '## Feedback', '', '## Pendências', '', '- nenhuma', '', '## Próxima missão', '', '',
  ].join('\n'));
  return path.relative(raiz, arquivo).split(path.sep).join('/');
}

export function criarAluno(raiz, config, slugAluno, nome) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slugAluno) || SLUGS_RESERVADOS.test(slugAluno)) throw new Error('slug inválido: use minúsculas, números e hífen (e evite nomes reservados do Windows, como con, nul e aux)');
  if (!String(nome ?? '').trim()) throw new Error('informe o nome de exibição');
  const dir = path.join(raiz, 'academia', 'alunos', slugAluno);
  if (fs.existsSync(dir)) throw new Error(`academia/alunos/${slugAluno} já existe`);
  fs.mkdirSync(path.join(dir, 'sessoes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'entregas'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sessoes', '.gitkeep'), '');
  fs.writeFileSync(path.join(dir, 'entregas', '.gitkeep'), '');
  fs.writeFileSync(path.join(dir, 'perfil.md'), [
    '---', `slug: ${slugAluno}`, `nome: ${celula(nome)}`, 'compartilhar_xp: nao', 'ritmo: ', 'assistente: ', '---', '',
    `# Perfil · ${celula(nome)}`, '',
    '> Preencha na Missão 0 (modelo e orientações: academia/templates/perfil-aluno.md).', '',
    '## Objetivo com o curso', '', '## Ponto de partida', '', '## Preferências de estudo', '', '## Ambiente', '', '',
  ].join('\n'));
  gerarRegistros(raiz, config, { aluno: slugAluno });
  return `academia/alunos/${slugAluno}`;
}

const secao7 = (texto) => {
  const m = texto.match(/^## 7\.[^\n]*\n[\s\S]*?(?=^## 8\.)/m);
  return m ? m[0].trim() : null;
};
/** Perguntas de uma revisão espaçada: o bloco 15.2 (V1..V5) da lição; sem ele, o quiz da seção 7. */
const perguntasDeRevisao = (texto) => {
  const m = texto.match(/^### 15\.2[^\n]*\n[\s\S]*?(?=^### 15\.3)/m);
  return m ? m[0].trim() : secao7(texto);
};

/** Texto único para colar numa conversa com um assistente que não enxerga o repositório. */
export function montarKit(raiz, config, slugAluno, { hoje = new Date().toLocaleDateString('sv-SE') } = {}) {
  if (!listarAlunos(raiz).includes(slugAluno)) throw new Error(`aluno "${slugAluno}" não encontrado em academia/alunos/`);
  const { estado } = analisarAluno(raiz, slugAluno, config);
  const lerRel = (rel) => lerTexto(path.join(raiz, rel)).trimEnd();
  const etapa = Math.min(estado.etapaAtual, config.etapas.length);
  const partes = [];
  const bloco = (titulo, corpo) => partes.push(`===== ${titulo} =====\n${corpo}\n`);

  bloco('INSTRUÇÕES AO TUTOR', [
    'Você é o tutor da Academia de Engenharia de IA do repositório ai-engineer. Siga as regras do AI_CONTEXT.md abaixo.',
    `Eu sou o aluno ${slugAluno}. Esta conversa não tem acesso ao repositório: tudo o que você precisa está neste texto.`,
    'Comece pelas revisões sugeridas (do retomada.md), depois conduza a lição uma atividade por vez, sem entregar solução',
    'antes das dicas. Não revele gabaritos: eu os colo depois de responder. No fim eu vou pedir o relatório da sessão.',
    '',
    'DADOS DA SESSÃO A REGISTRAR (use exatamente estes valores no front matter do relatório):',
    `  aluno: ${slugAluno}`,
    `  sessao: ${estado.proximaSessao}`,
    `  data: ${hoje}`,
    `  etapa: ${etapa}`,
    `  arquivo: academia/alunos/${slugAluno}/sessoes/${hoje}-s${String(estado.proximaSessao).padStart(2, '0')}.md`,
  ].join('\n'));
  bloco('AI_CONTEXT.md', lerRel('AI_CONTEXT.md'));
  bloco('academia/GAMIFICACAO.md', lerRel('academia/GAMIFICACAO.md'));
  bloco('academia/competencias.md', lerRel('academia/competencias.md'));
  bloco('academia/templates/relatorio-sessao.md', lerRel('academia/templates/relatorio-sessao.md'));
  bloco(`academia/alunos/${slugAluno}/retomada.md`, lerRel(`academia/alunos/${slugAluno}/retomada.md`));

  const e = config.etapas[etapa - 1];
  if (estado.etapaAtual === 0) bloco('LIÇÃO: Missão 0 (sem o gabarito)', lerRel('academia/licoes/00-missao-0-diagnostico/README.md'));
  else if (e?.status === 'pronta' && e.licao) bloco(`LIÇÃO: etapa ${etapa} (sem o gabarito)`, lerRel(`academia/${e.licao}`));
  else if (e) {
    const rm = lerRel('academia/ROADMAP.md');
    const m = rm.match(new RegExp(`^### Etapa ${etapa} [\\s\\S]*?(?=^(?:### |---|## ))`, 'm'));
    bloco(`ETAPA ${etapa} AINDA SEM LIÇÃO: plano do ROADMAP e template`, [
      'Esta etapa ainda não tem lição pronta (status "roteiro"). Escreva a lição com o template abaixo ANTES de registrar XP;',
      'ela vira um arquivo novo em academia/licoes/ (peça ao aluno para salvá-la) e a etapa passa a "pronta" no ROADMAP.', '',
      m ? m[0].trim() : '(plano da etapa não encontrado)', '', '--- template ---', lerRel('academia/templates/licao.md')].join('\n'));
  }
  for (const r of estado.revisoesSugeridas.slice(0, 3)) {
    const lic = config.etapas[r.etapa - 1];
    if (lic?.status !== 'pronta' || !lic.licao) continue;
    const q = perguntasDeRevisao(lerRel(`academia/${lic.licao}`));
    if (q) bloco(`REVISÃO SUGERIDA: etapa ${r.etapa}, revisão ${r.numero} (id R${String(r.etapa).padStart(2, '0')}-${r.numero}); use estas perguntas`, q);
  }
  return partes.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------
const AJUDA = `Uso: node academia/ferramentas/academia.mjs <comando>

  validar [--aluno <aluno>]     confere conteúdo, links, segredos e registros (com --aluno, só os desse aluno)
  progresso [<aluno>] [--check] recria (ou só confere) retomada.md e PROGRESS.md; recusa se houver erros nas sessões
  sessao <aluno> [--etapa N] [--data AAAA-MM-DD]
                                cria o arquivo da próxima sessão do aluno
  kit <aluno>                   imprime o texto para colar numa conversa com um assistente de IA
  novo-aluno <slug> "Nome"      cria a pasta e o perfil de um aluno`;

const MAX_LINHAS = 60;
function imprimir(lista, rotulo) {
  for (const i of lista.slice(0, MAX_LINHAS)) console.log(`${rotulo} ${i.arquivo}: ${i.mensagem}`);
  if (lista.length > MAX_LINHAS) console.log(`... e mais ${lista.length - MAX_LINHAS}`);
}

/** Separa posicionais e opções; opção desconhecida ou sem valor é erro (um `--chek` não pode virar escrita silenciosa). */
function lerArgs(args, comOpcao, booleanas = []) {
  const pos = [];
  const opcoes = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    if (booleanas.includes(a)) { opcoes[a] = true; continue; }
    if (!comOpcao.includes(a)) throw new Error(`opção desconhecida: ${a}`);
    if (args[i + 1] === undefined || args[i + 1].startsWith('--')) throw new Error(`a opção ${a} precisa de um valor`);
    opcoes[a] = args[++i];
  }
  return { pos, opcoes };
}

export function main(argv, raiz = RAIZ_PADRAO) {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === 'ajuda' || cmd === '--help') { console.log(AJUDA); return 0; }
  try {
    if (cmd === 'validar') {
      const { opcoes, pos } = lerArgs(args, ['--aluno']);
      if (pos.length) throw new Error('validar não recebe argumentos posicionais; use --aluno <aluno>');
      const { erros, config } = validarTudo(raiz, { aluno: opcoes['--aluno'] ?? null });
      if (erros.length) {
        imprimir(erros, 'erro');
        console.log(`\n${erros.length} problema(s) encontrado(s).`);
        return 1;
      }
      console.log(`Tudo certo: ${config.etapas.length} etapas, ${config.competencias.length} competências, ${listarAlunos(raiz).length} aluno(s).`);
      return 0;
    }

    const { erros: errosCfg, config } = carregarConfig(raiz);
    if (errosCfg.length) { imprimir(errosCfg, 'erro'); return 1; }

    if (cmd === 'progresso') {
      const { pos, opcoes } = lerArgs(args, [], ['--check']);
      if (pos.length > 1) throw new Error('uso: progresso [<aluno>] [--check]');
      const checar = Boolean(opcoes['--check']);
      const r = gerarRegistros(raiz, config, { somenteChecar: checar, aluno: pos[0] ?? null });
      if (r.erros.length) {
        imprimir(r.erros, 'erro');
        if (!checar) console.log('\nCorrija os erros acima nos relatórios de sessão e rode de novo: nada foi gravado.');
        return 1;
      }
      console.log(checar ? 'Registros atualizados.' : 'Registros gerados.');
      return 0;
    }
    if (cmd === 'sessao') {
      const { pos, opcoes } = lerArgs(args, ['--etapa', '--data']);
      if (pos.length !== 1) throw new Error('uso: sessao <aluno> [--etapa N] [--data AAAA-MM-DD]');
      const etapa = opcoes['--etapa'];
      if (etapa !== undefined && !(Number.isInteger(inteiro(etapa)) && inteiro(etapa) >= 0 && inteiro(etapa) <= config.etapas.length)) throw new Error('--etapa deve ser um inteiro de 0 a 16');
      console.log(`Criado ${criarSessao(raiz, config, pos[0], { etapa: etapa === undefined ? undefined : inteiro(etapa), data: opcoes['--data'] })}`);
      return 0;
    }
    if (cmd === 'kit') {
      const { pos } = lerArgs(args, []);
      if (pos.length !== 1) throw new Error('uso: kit <aluno>');
      process.stdout.write(montarKit(raiz, config, pos[0]));
      return 0;
    }
    if (cmd === 'novo-aluno') {
      const { pos } = lerArgs(args, []);
      if (pos.length !== 2) throw new Error('uso: novo-aluno <slug> "Nome"');
      console.log(`Criado ${criarAluno(raiz, config, pos[0], pos[1])}`);
      return 0;
    }
  } catch (err) {
    console.error(`erro: ${err.message}`);
    return 1;
  }
  console.error(`comando desconhecido: ${cmd}\n\n${AJUDA}`);
  return 2;
}

if (ehPrincipal(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
