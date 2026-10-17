#!/usr/bin/env node
// Ferramenta da Academia: valida o conteúdo e os registros e gera os arquivos de progresso.
// Sem dependências (Node 22+). As regras (XP, níveis, conquistas, competências, etapas) são LIDAS das tabelas de
// GAMIFICACAO.md, competencias.md e ROADMAP.md: elas são a fonte de verdade, este script só as aplica.
//
//   node academia/ferramentas/academia.mjs validar            confere conteúdo, links e registros dos alunos
//   node academia/ferramentas/academia.mjs progresso          recria retomada.md de cada aluno e PROGRESS.md
//   node academia/ferramentas/academia.mjs progresso --check  só confere se estão atualizados
//   node academia/ferramentas/academia.mjs sessao <aluno>     cria o arquivo da próxima sessão
//   node academia/ferramentas/academia.mjs novo-aluno <slug> "Nome"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ_PADRAO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------------------------------------------
// Leitura de Markdown (tolerante a CRLF: no Windows o Git costuma converter as quebras de linha)
// ---------------------------------------------------------------------------------------------------------------
export const lerTexto = (arquivo) => fs.readFileSync(arquivo, 'utf8').replace(/\r\n?/g, '\n');

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const chave = (s) => semAcento(String(s)).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const limpar = (s) => String(s).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '').trim();

export function frontMatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { dados: {}, corpo: texto, tem: false };
  const dados = {};
  for (const linha of m[1].split('\n')) {
    const k = linha.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (k) dados[k[1]] = k[2].trim().replace(/^["']|["']$/g, '');
  }
  return { dados, corpo: texto.slice(m[0].length), tem: true };
}

/** Divide o texto em seções "## Título" (ignora blocos de código). Chave = título sem acento e minúsculo. */
export function secoes(texto) {
  const mapa = new Map();
  let atual = null;
  let cerca = false;
  for (const linha of texto.split('\n')) {
    if (/^\s*```/.test(linha)) cerca = !cerca;
    const h = !cerca && linha.match(/^##\s+(.*?)\s*$/);
    if (h) {
      atual = { titulo: h[1], linhas: [] };
      mapa.set(chave(h[1]), atual);
    } else if (atual) atual.linhas.push(linha);
  }
  return mapa;
}

/** Primeira tabela Markdown das linhas dadas -> lista de objetos (chaves normalizadas) ou null se não houver. */
export function tabela(linhas) {
  const bloco = [];
  let comecou = false;
  for (const l of linhas) {
    if (/^\s*\|/.test(l)) { bloco.push(l); comecou = true; } else if (comecou) break;
  }
  if (bloco.length < 2) return null;
  const celulas = (l) => l.trim().replace(/\\\|/g, '\u0001').replace(/^\|/, '').replace(/\|$/, '')
    .split('|').map((c) => c.replace(/\u0001/g, '|').trim());
  const cab = celulas(bloco[0]).map(chave);
  return bloco.slice(2).map((l) => {
    const c = celulas(l);
    return Object.fromEntries(cab.map((k, i) => [k, c[i] ?? '']));
  });
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

// ---------------------------------------------------------------------------------------------------------------
// Configuração: lida das tabelas dos documentos
// ---------------------------------------------------------------------------------------------------------------
const TITULOS_LICAO = [
  'Identificação e pré-requisitos', 'Objetivos de aprendizagem', 'Duração estimada', 'Microlição',
  'Material complementar', 'Exemplos práticos', 'Quiz de fixação', 'Desafio hands-on', 'Critérios de aceitação',
  'Rubrica de avaliação', 'Dicas graduais', 'Modelo de relatório do aluno', 'Competências registradas',
  'Referências e última revisão',
];
const STATUS_ETAPA = ['em-andamento', 'pausada', 'concluida'];
const RESULTADOS = ['aprovado', 'parcial', 'reprovado'];
const TIPO_POR_SUFIXO = { quiz: 'quiz', lab: 'laboratorio', explicacao: 'explicacao' };
const REGRAS_CONTADOR = ['xp', 'revisoes', 'opcionais', 'explicacoes', 'retomadas'];

export function carregarConfig(raiz) {
  const erros = [];
  const ac = path.join(raiz, 'academia');
  const ler = (arquivo, secao, colunas) => {
    const caminho = path.join(ac, arquivo);
    if (!fs.existsSync(caminho)) { erros.push({ arquivo: `academia/${arquivo}`, mensagem: 'arquivo não encontrado' }); return []; }
    const sec = secoes(lerTexto(caminho)).get(chave(secao));
    const t = sec ? tabela(sec.linhas) : null;
    if (!t) { erros.push({ arquivo: `academia/${arquivo}`, mensagem: `falta a tabela da seção "## ${secao}"` }); return []; }
    for (const c of colunas) if (t.length && !(c in t[0])) erros.push({ arquivo: `academia/${arquivo}`, mensagem: `a tabela de "${secao}" precisa da coluna "${c}"` });
    return t;
  };

  const xp = {};
  for (const l of ler('GAMIFICACAO.md', 'XP', ['tipo', 'xp'])) {
    const n = Number(l.xp);
    if (!Number.isInteger(n) || n <= 0) erros.push({ arquivo: 'academia/GAMIFICACAO.md', mensagem: `XP inválido para ${l.tipo}` });
    xp[limpar(l.tipo)] = n;
  }
  const niveis = ler('GAMIFICACAO.md', 'Níveis', ['nivel', 'xp_minimo', 'checkpoints_exigidos']).map((l) => ({
    nome: limpar(l.nivel),
    xpMin: Number(l.xp_minimo),
    checkpoints: limpar(l.checkpoints_exigidos).split(',').map((s) => s.trim()).filter((s) => /^CP\d+$/.test(s)),
  }));
  const checkpoints = ler('GAMIFICACAO.md', 'Checkpoints de domínio', ['id', 'fase', 'apos_a_etapa']).map((l) => ({
    id: limpar(l.id), fase: Number(l.fase), apos: Number(l.apos_a_etapa),
  }));
  const conquistas = ler('GAMIFICACAO.md', 'Conquistas', ['id', 'conquista', 'regra']).map((l) => ({
    id: limpar(l.id), nome: limpar(l.conquista), regra: limpar(l.regra), descricao: limpar(l.descricao ?? ''),
  }));
  const revisoes = ler('GAMIFICACAO.md', 'Revisão espaçada', ['revisao', 'sessoes_apos_a_conclusao'])
    .map((l) => Number(l.sessoes_apos_a_conclusao));
  const competencias = ler('competencias.md', 'Catálogo', ['id', 'competencia', 'etapa', 'fase']).map((l) => ({
    id: limpar(l.id), texto: limpar(l.competencia), etapa: Number(l.etapa), fase: Number(l.fase),
  }));
  const etapas = ler('ROADMAP.md', 'Visão geral', ['etapa', 'fase', 'titulo', 'licao', 'status']).map((l) => ({
    n: Number(l.etapa), fase: Number(l.fase), titulo: limpar(l.titulo), licao: (l.licao.match(/\]\(([^)]+)\)/) ?? [])[1] ?? null,
    status: limpar(l.status),
  }));

  // consistência da configuração
  const f = (mensagem, arquivo = 'academia/GAMIFICACAO.md') => erros.push({ arquivo, mensagem });
  for (const t of ['quiz', 'laboratorio', 'explicacao', 'revisao', 'opcional']) if (!(t in xp)) f(`falta o tipo de XP "${t}"`);
  if (!niveis.length || niveis[0].xpMin !== 0) f('o primeiro nível deve ter XP mínimo 0');
  niveis.forEach((n, i) => {
    if (!Number.isFinite(n.xpMin)) f(`XP mínimo inválido no nível ${n.nome}`);
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
    if (!etapas.some((e) => e.n === k.apos && e.fase === k.fase)) f(`checkpoint ${k.id}: etapa/fase inconsistentes com o ROADMAP`);
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

// ---------------------------------------------------------------------------------------------------------------
// Alunos e sessões
// ---------------------------------------------------------------------------------------------------------------
export function listarAlunos(raiz) {
  const dir = path.join(raiz, 'academia', 'alunos');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'perfil.md')))
    .map((d) => d.name).sort();
}

// Evidência válida: um caminho entre crases ou uma nota objetiva (pelo menos 10 caracteres que não sejam só traços).
const temEvidencia = (celula) => {
  const t = limpar(celula ?? '').replace(/\s+/g, ' ');
  return t.length >= 10 && !/^[-—–\s]+$/.test(t);
};
const decodificar = (t) => { try { return decodeURIComponent(t); } catch { return t; } };

function lerSessao(arquivo, rel, slugAluno, config) {
  const erros = [];
  const e = (mensagem) => erros.push({ arquivo: rel, mensagem });
  const texto = lerTexto(arquivo);
  const { dados, corpo, tem } = frontMatter(texto);
  const nome = path.basename(arquivo);
  const nm = nome.match(/^(\d{4}-\d{2}-\d{2})-s(\d{2,})\.md$/);
  if (!nm) e('nome inválido: use AAAA-MM-DD-sNN.md');
  if (!tem) e('falta o front matter (--- ... ---)');
  if (dados.aluno !== slugAluno) e(`aluno "${dados.aluno}" não confere com a pasta "${slugAluno}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data ?? '') || Number.isNaN(Date.parse(dados.data))) e('data inválida (AAAA-MM-DD)');
  else if (nm && nm[1] !== dados.data) e(`a data do nome (${nm[1]}) não confere com a do front matter (${dados.data})`);
  const sessao = Number(dados.sessao);
  if (!Number.isInteger(sessao) || sessao < 1) e('`sessao` deve ser um inteiro >= 1');
  else if (nm && Number(nm[2]) !== sessao) e(`o número do nome (s${nm[2]}) não confere com sessao: ${dados.sessao}`);
  const etapa = Number(dados.etapa);
  if (!Number.isInteger(etapa) || etapa < 0 || etapa > config.etapas.length) e('`etapa` deve ser um inteiro de 0 a 16');
  if (!STATUS_ETAPA.includes(dados.status_etapa)) e(`status_etapa deve ser: ${STATUS_ETAPA.join(', ')}`);
  if (!['sim', 'nao'].includes(dados.retomada)) e('retomada deve ser "sim" ou "nao"');

  const sec = secoes(corpo);
  const tab = (titulo, colunas) => {
    const t = tabela(sec.get(chave(titulo))?.linhas ?? []);
    if (!t) { e(`falta a tabela da seção "## ${titulo}"`); return []; }
    const cab = Object.keys(t[0] ?? Object.fromEntries(colunas.map((c) => [c, ''])));
    for (const c of colunas) if (!cab.includes(c)) e(`a tabela "${titulo}" precisa da coluna "${c}"`);
    return t;
  };
  const atividades = tab('Atividades', ['id', 'tipo', 'tentativa', 'resultado', 'evidencia', 'xp']);
  const competencias = tab('Competências', ['id', 'nivel', 'evidencia']);
  const checkpoints = tab('Checkpoints', ['id', 'resultado', 'evidencia']);
  const pendencias = textoDe(sec.get('pendencias')).split('\n').map((l) => l.match(/^-\s+(.*)/)?.[1]).filter((l) => l && !/^nenhuma\.?$/i.test(l));
  return {
    erros,
    sessao: {
      arquivo: rel, nome, data: dados.data, numero: sessao, etapa, status: dados.status_etapa, retomada: dados.retomada === 'sim',
      atividades, competencias, checkpoints, pendencias,
      resumo: textoDe(sec.get('resumo')), feedback: textoDe(sec.get('feedback')), proxima: textoDe(sec.get('proxima_missao')),
    },
  };
}

function evidenciaExiste(celula, raiz, dirAluno) {
  const caminhos = [...celula.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((p) => /[/\\]|\.\w{1,5}$/.test(p));
  if (!caminhos.length) return null;
  return caminhos.filter((p) => !fs.existsSync(path.join(dirAluno, p)) && !fs.existsSync(path.join(raiz, p)));
}

/** Aplica as sessões em ordem e devolve o estado do aluno e os erros de consistência. */
export function analisarAluno(raiz, slugAluno, config) {
  const dirAluno = path.join(raiz, 'academia', 'alunos', slugAluno);
  const relAluno = `academia/alunos/${slugAluno}`;
  const erros = [];
  const avisos = [];
  const perfilTexto = lerTexto(path.join(dirAluno, 'perfil.md'));
  const perfil = frontMatter(perfilTexto).dados;
  if (perfil.slug !== slugAluno) erros.push({ arquivo: `${relAluno}/perfil.md`, mensagem: `slug "${perfil.slug}" não confere com a pasta "${slugAluno}"` });
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slugAluno)) erros.push({ arquivo: relAluno, mensagem: 'nome de pasta inválido (minúsculas, números e hífen)' });
  if (!perfil.nome) erros.push({ arquivo: `${relAluno}/perfil.md`, mensagem: 'falta `nome` no front matter' });
  if (!['sim', 'nao'].includes(perfil.compartilhar_xp)) erros.push({ arquivo: `${relAluno}/perfil.md`, mensagem: '`compartilhar_xp` deve ser "sim" ou "nao"' });

  const dirSessoes = path.join(dirAluno, 'sessoes');
  const arquivos = fs.existsSync(dirSessoes) ? fs.readdirSync(dirSessoes).filter((f) => f.endsWith('.md')).sort() : [];
  const sessoes = [];
  for (const f of arquivos) {
    const r = lerSessao(path.join(dirSessoes, f), `${relAluno}/sessoes/${f}`, slugAluno, config);
    erros.push(...r.erros);
    sessoes.push(r.sessao);
  }
  sessoes.sort((a, b) => (a.numero || 0) - (b.numero || 0));
  const vistos = new Set();
  for (const s of sessoes) {
    if (vistos.has(s.numero)) erros.push({ arquivo: s.arquivo, mensagem: `número de sessão repetido (${s.numero})` });
    vistos.add(s.numero);
  }

  const est = {
    slug: slugAluno, nome: perfil.nome ?? slugAluno, compartilharXp: perfil.compartilhar_xp === 'sim', xp: 0,
    atividades: new Map(), competencias: new Map(), checkpoints: new Map(), concluidas: new Map(), conquistas: new Map(),
    contagens: { revisoes: 0, opcionais: 0, explicacoes: 0, retomadas: 0 }, sessoes, xpPorSessao: new Map(), pendenciasAtividades: [],
  };
  const contexto = () => ({ xp: est.xp, ativ: new Set([...est.atividades].filter(([, a]) => a.aprovada).map(([id]) => id)),
    comp: new Map([...est.competencias].map(([id, c]) => [id, c.nivel])), cps: new Set(est.checkpoints.keys()), ...est.contagens });
  const xpTipos = config.xp;
  const nivelDaFase = (fase) => config.competencias.filter((c) => c.fase === fase).every((c) => (est.competencias.get(c.id)?.nivel ?? 0) >= 2);

  for (const s of sessoes) {
    const e = (mensagem) => erros.push({ arquivo: s.arquivo, mensagem });
    let ganho = 0;
    if (s.retomada) est.contagens.retomadas += 1;

    for (const a of s.atividades) {
      const id = limpar(a.id);
      const m = id.match(/^E(\d{2})-(quiz|lab|explicacao|opcional-\d+)$/) ?? id.match(/^R(\d{2})-(\d+)$/);
      if (!m) { e(`id de atividade inválido: "${id}" (veja a convenção em GAMIFICACAO.md)`); continue; }
      const etapaId = Number(m[1]);
      if (etapaId > config.etapas.length) e(`${id}: etapa inexistente`);
      const esperado = id.startsWith('R') ? 'revisao' : m[2].startsWith('opcional') ? 'opcional' : TIPO_POR_SUFIXO[m[2]];
      const tipo = limpar(a.tipo);
      if (tipo !== esperado) e(`${id}: tipo "${tipo}" não confere com o id (esperado "${esperado}")`);
      if (!(tipo in xpTipos)) { e(`${id}: tipo de XP desconhecido ("${tipo}")`); continue; }
      const tentativa = Number(a.tentativa);
      if (!Number.isInteger(tentativa) || tentativa < 1) e(`${id}: tentativa deve ser um inteiro >= 1`);
      const resultado = limpar(a.resultado);
      if (!RESULTADOS.includes(resultado)) { e(`${id}: resultado deve ser ${RESULTADOS.join(', ')}`); continue; }
      const xp = Number(a.xp);
      if (!Number.isInteger(xp) || xp < 0) { e(`${id}: XP deve ser um inteiro >= 0`); continue; }
      const evid = a.evidencia ?? '';
      const ja = est.atividades.get(id) ?? { tentativas: 0, aprovada: false, ultimo: null };
      ja.tentativas += 1;
      ja.ultimo = resultado;

      if (xp > 0) {
        if (resultado !== 'aprovado') e(`${id}: XP só pode ser concedido a uma atividade aprovada`);
        if (ja.aprovada) e(`${id}: XP já concedido antes (cada atividade rende XP uma única vez)`);
        if (xp !== xpTipos[tipo]) e(`${id}: XP ${xp} não confere com a tabela (${tipo} = ${xpTipos[tipo]})`);
        if (!temEvidencia(evid)) e(`${id}: XP sem evidência (aponte um arquivo entre crases ou descreva a prova, com pelo menos 10 caracteres)`);
      } else if (resultado === 'aprovado' && !ja.aprovada) {
        e(`${id}: aprovada pela primeira vez, mas sem XP (use o valor da tabela de XP)`);
      }
      if (resultado === 'aprovado') {
        const faltando = evidenciaExiste(evid, raiz, dirAluno);
        if (faltando?.length) e(`${id}: evidência não encontrada: ${faltando.join(', ')}`);
      }
      if (id.startsWith('R') && !est.concluidas.has(etapaId) && !(s.status === 'concluida' && s.etapa === etapaId)) {
        e(`${id}: revisão de uma etapa que ainda não foi concluída`);
      }
      if (xp > 0 && resultado === 'aprovado' && !ja.aprovada) {
        est.xp += xp; ganho += xp;
        if (tipo === 'revisao') est.contagens.revisoes += 1;
        if (tipo === 'opcional') est.contagens.opcionais += 1;
        if (tipo === 'explicacao') est.contagens.explicacoes += 1;
      }
      if (resultado === 'aprovado') ja.aprovada = true;
      est.atividades.set(id, ja);
    }

    for (const c of s.competencias) {
      const id = limpar(c.id);
      const nivel = Number(c.nivel);
      if (!config.competencias.some((x) => x.id === id)) { e(`competência inexistente: ${id}`); continue; }
      if (!Number.isInteger(nivel) || nivel < 0 || nivel > 3) { e(`${id}: nível deve ser de 0 a 3`); continue; }
      if (nivel >= 1 && !temEvidencia(c.evidencia)) e(`${id}: nível ${nivel} sem evidência`);
      est.competencias.set(id, { nivel, sessao: s.numero, evidencia: limpar(c.evidencia) });
    }

    if (s.status === 'concluida') {
      const nn = String(s.etapa).padStart(2, '0');
      for (const exigido of [`E${nn}-quiz`, `E${nn}-lab`]) {
        if (!est.atividades.get(exigido)?.aprovada) e(`etapa ${s.etapa} marcada como concluída sem ${exigido} aprovado`);
      }
      if (!est.concluidas.has(s.etapa)) est.concluidas.set(s.etapa, s.numero);
    }

    for (const k of s.checkpoints) {
      const id = limpar(k.id);
      const cfg = config.checkpoints.find((x) => x.id === id);
      if (!cfg) { e(`checkpoint inexistente: ${id}`); continue; }
      const resultado = limpar(k.resultado);
      if (!['aprovado', 'pendente'].includes(resultado)) { e(`${id}: resultado deve ser aprovado ou pendente`); continue; }
      if (resultado !== 'aprovado') continue;
      if (!temEvidencia(k.evidencia)) e(`${id}: aprovado sem evidência`);
      if (!est.concluidas.has(cfg.apos)) e(`${id}: exige a etapa ${cfg.apos} concluída`);
      if (!nivelDaFase(cfg.fase)) e(`${id}: exige todas as competências da fase ${cfg.fase} no nível 2 ou mais`);
      if (!est.checkpoints.has(id)) est.checkpoints.set(id, s.numero);
    }

    for (const q of config.conquistas) {
      if (!est.conquistas.has(q.id) && avaliarRegra(q.regra, contexto())) est.conquistas.set(q.id, s.numero);
    }
    est.xpPorSessao.set(s.numero, ganho);
  }

  est.pendenciasAtividades = [...est.atividades].filter(([, a]) => !a.aprovada)
    .map(([id, a]) => ({ id, tentativas: a.tentativas, ultimo: a.ultimo }));
  finalizar(est, config);
  return { estado: est, erros, avisos };
}

export function avaliarRegra(regra, ctx) {
  let m;
  if ((m = regra.match(/^ativ:(.+)$/))) return ctx.ativ.has(m[1]);
  if ((m = regra.match(/^cp:(.+)$/))) return ctx.cps.has(m[1]);
  if ((m = regra.match(/^comp:([A-Z0-9,]+)>=([0-3])$/))) return m[1].split(',').every((c) => (ctx.comp.get(c) ?? 0) >= Number(m[2]));
  if ((m = regra.match(/^([a-z]+)>=(\d+)$/))) return (ctx[m[1]] ?? 0) >= Number(m[2]);
  return false;
}

/** Calcula nível, etapa atual e revisões sugeridas a partir do estado acumulado. */
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
  const total = est.ultima?.numero ?? 0;
  est.revisoesSugeridas = [];
  for (const [etapa, quando] of est.concluidas) {
    if (etapa === 0) continue;
    const nn = String(etapa).padStart(2, '0');
    const feitas = [...est.atividades].filter(([id, a]) => id.startsWith(`R${nn}-`) && a.aprovada).length;
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
  L.push('<!-- Gerado por `node academia/ferramentas/academia.mjs progresso`. Não edite: a fonte são os arquivos de sessoes/. -->');
  L.push(`# Retomada · ${est.nome}`, '');
  L.push(`**Nível:** ${est.nivel.nome} · **XP:** ${est.xp} · **Etapa atual:** ${tituloEtapa(est.etapaAtual, config)}`, '');
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
    if (u.resumo) L.push(`- Resumo: ${u.resumo.split('\n')[0]}`);
    L.push('');
  }

  L.push('## Próxima missão', '');
  L.push(est.ultima?.proxima || (est.ultima ? 'Escolha a próxima atividade da lição atual.' : 'Fazer a Missão 0: perfil, ambiente e diagnóstico.'), '');

  if (est.ultima?.feedback) {
    L.push('## Último feedback', '', ...est.ultima.feedback.split('\n').map((l) => (l ? `> ${l}` : '>')), '');
  }

  L.push('## Pendências', '');
  const pend = [...(est.ultima?.pendencias ?? []).map((p) => `- ${p}`),
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
    L.push('| Aluno | Nível | Etapa atual | Etapas concluídas | XP | Última sessão |', '|---|---|---|---|---|---|');
    for (const e of estados) {
      const n = [...e.concluidas.keys()].filter((x) => x >= 1).length;
      L.push(`| [${e.nome}](alunos/${e.slug}/retomada.md) | ${e.nivel.nome} | ${tituloEtapa(e.etapaAtual, config)} | \`${barra(n, 16, 10)}\` ${n}/16 | ${e.compartilharXp ? e.xp : '—'} | ${e.ultima?.data ?? '—'} |`);
    }
    L.push('');
    L.push('## Por etapa', '', '✅ concluída · ▶ etapa atual · · pendente', '');
    L.push(`| Etapa | Título | ${estados.map((e) => e.nome).join(' | ')} |`, `|---|---|${estados.map(() => '---').join('|')}|`);
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
alfabética: não há ranking.

`;

function montarProgress(raiz, bloco) {
  const arquivo = path.join(raiz, 'academia', 'PROGRESS.md');
  const atual = fs.existsSync(arquivo) ? lerTexto(arquivo) : null;
  const m = atual?.match(new RegExp(`^([\\s\\S]*?)${MARCA_INI}[\\s\\S]*?${MARCA_FIM}([\\s\\S]*)$`));
  return m ? `${m[1]}${bloco}${m[2]}` : `${CABECALHO_PROGRESS}${bloco}\n`;
}

export function gerarRegistros(raiz, config, { somenteChecar = false } = {}) {
  const erros = [];
  const estados = [];
  const saidas = [];
  for (const slugAluno of listarAlunos(raiz)) {
    const r = analisarAluno(raiz, slugAluno, config);
    estados.push(r.estado);
    saidas.push({ arquivo: path.join(raiz, 'academia', 'alunos', slugAluno, 'retomada.md'), texto: renderRetomada(r.estado, config) + '\n' });
  }
  saidas.push({ arquivo: path.join(raiz, 'academia', 'PROGRESS.md'), texto: montarProgress(raiz, renderProgresso(estados, config)) });
  for (const s of saidas) {
    const rel = path.relative(raiz, s.arquivo).split(path.sep).join('/');
    const atual = fs.existsSync(s.arquivo) ? lerTexto(s.arquivo) : null;
    if (atual === s.texto) continue;
    if (somenteChecar) erros.push({ arquivo: rel, mensagem: 'desatualizado: rode `node academia/ferramentas/academia.mjs progresso`' });
    else fs.writeFileSync(s.arquivo, s.texto);
  }
  return { erros, estados };
}

// ---------------------------------------------------------------------------------------------------------------
// Validação do conteúdo: lições, roadmap, links, segredos
// ---------------------------------------------------------------------------------------------------------------
function listarMarkdown(raiz) {
  const saida = [];
  const andar = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name === 'node_modules' || d.name.startsWith('.')) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) andar(p); else if (d.name.endsWith('.md')) saida.push(p);
    }
  };
  if (fs.existsSync(path.join(raiz, 'academia'))) andar(path.join(raiz, 'academia'));
  for (const f of ['AI_CONTEXT.md', 'README.md']) if (fs.existsSync(path.join(raiz, f))) saida.push(path.join(raiz, f));
  return saida;
}

export function validarLinks(raiz) {
  const erros = [];
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
      if (cerca) return;
      const semCodigo = linha.replace(/`[^`]*`/g, '');
      for (const m of semCodigo.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const alvo = m[1];
        if (/^(https?:|mailto:|#$)/.test(alvo) || alvo.startsWith('<')) continue;
        const [caminho, frag] = alvo.split('#');
        const destino = caminho ? path.resolve(path.dirname(arquivo), decodificar(caminho)) : arquivo;
        if (!fs.existsSync(destino)) { erros.push({ arquivo: `${rel}:${i + 1}`, mensagem: `link quebrado: ${alvo}` }); continue; }
        if (frag && destino.endsWith('.md') && fs.statSync(destino).isFile() && !ancorasDe(destino).has(decodificar(frag))) {
          erros.push({ arquivo: `${rel}:${i + 1}`, mensagem: `âncora inexistente: ${alvo}` });
        }
      }
    });
  }
  return erros;
}

const SEGREDOS = [/sk-[A-Za-z0-9_-]{16,}/, /Bearer\s+[A-Za-z0-9._~+/-]{16,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

export function validarSegredos(raiz) {
  const erros = [];
  const arquivos = [];
  const andar = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name === 'node_modules' || d.name.startsWith('.')) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) andar(p); else if (/\.(md|mjs|js|json|ya?ml|txt)$/.test(d.name)) arquivos.push(p);
    }
  };
  if (fs.existsSync(path.join(raiz, 'academia'))) andar(path.join(raiz, 'academia'));
  for (const f of ['AI_CONTEXT.md']) if (fs.existsSync(path.join(raiz, f))) arquivos.push(path.join(raiz, f));
  for (const a of arquivos) {
    const t = lerTexto(a);
    for (const p of SEGREDOS) if (p.test(t)) erros.push({ arquivo: path.relative(raiz, a).split(path.sep).join('/'), mensagem: `possível segredo (padrão ${p})` });
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
    if (etapaEsperada !== null && Number(dados.etapa) !== etapaEsperada) e(`etapa ${dados.etapa} não confere com o nome da pasta (${etapaEsperada})`);
    if (etapaEsperada !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dados.revisado_em ?? '')) e('revisado_em deve ser AAAA-MM-DD');
    if (etapaEsperada !== null) {
      const declaradas = (dados.competencias ?? '').split(',').map((s) => s.trim()).filter((s) => /^C\d{2}$/.test(s)).sort();
      const doCatalogo = config.competencias.filter((c) => c.etapa === Number(dados.etapa)).map((c) => c.id).sort();
      if (etapaEsperada > 0 && declaradas.join() !== doCatalogo.join()) e(`competencias (${declaradas.join(', ')}) diferem do catálogo para a etapa (${doCatalogo.join(', ')})`);
    }
    const titulos = [...corpo.matchAll(/^## (\d+)\.\s+(.*?)\s*$/gm)].map((m) => [Number(m[1]), m[2]]);
    TITULOS_LICAO.forEach((t, i) => {
      if (!titulos[i] || titulos[i][0] !== i + 1 || titulos[i][1] !== t) e(`seção ${i + 1} deve ser "## ${i + 1}. ${t}"`);
    });
  };

  const tmpl = path.join(raiz, 'academia', 'templates', 'licao.md');
  if (fs.existsSync(tmpl)) confere(tmpl, 'academia/templates/licao.md', null); else erros.push({ arquivo: 'academia/templates/licao.md', mensagem: 'template de lição não encontrado' });

  const pastas = fs.existsSync(dirLicoes) ? fs.readdirSync(dirLicoes, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  const existentes = new Set();
  for (const nome of pastas) {
    const m = nome.match(/^(\d{2})-/);
    const rel = `academia/licoes/${nome}/README.md`;
    if (!m) { erros.push({ arquivo: `academia/licoes/${nome}`, mensagem: 'a pasta da lição deve começar com NN-' }); continue; }
    if (!fs.existsSync(path.join(dirLicoes, nome, 'README.md'))) { erros.push({ arquivo: rel, mensagem: 'lição sem README.md' }); continue; }
    existentes.add(Number(m[1]));
    confere(path.join(dirLicoes, nome, 'README.md'), rel, Number(m[1]));
    if (!fs.existsSync(path.join(dirLicoes, nome, 'gabarito.md'))) erros.push({ arquivo: `academia/licoes/${nome}`, mensagem: 'falta gabarito.md (o gabarito do quiz fica separado)' });
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

export function validarTudo(raiz) {
  const { erros: errosCfg, config } = carregarConfig(raiz);
  const erros = [...errosCfg];
  if (errosCfg.length) return { erros, avisos: [], config };
  erros.push(...validarLicoes(raiz, config));
  for (const a of listarAlunos(raiz)) erros.push(...analisarAluno(raiz, a, config).erros);
  erros.push(...validarLinks(raiz), ...validarSegredos(raiz));
  erros.push(...gerarRegistros(raiz, config, { somenteChecar: true }).erros);
  return { erros, avisos: [], config };
}

// ---------------------------------------------------------------------------------------------------------------
// Comandos que criam arquivos
// ---------------------------------------------------------------------------------------------------------------
export function criarSessao(raiz, config, slugAluno, { etapa, data } = {}) {
  if (!listarAlunos(raiz).includes(slugAluno)) throw new Error(`aluno "${slugAluno}" não encontrado em academia/alunos/ (use novo-aluno)`);
  const { estado } = analisarAluno(raiz, slugAluno, config);
  const numero = (estado.ultima?.numero ?? 0) + 1;
  const dia = data ?? new Date().toLocaleDateString('sv-SE');
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
    '> Cole aqui o relatório gerado pelo assistente (modelo: academia/templates/relatorio-sessao.md). Se esta é a primeira',
    '> sessão depois de uma pausa, troque `retomada: nao` por `retomada: sim`. Apague estes comentários.', '',
    '## Resumo', '', '## Atividades', '',
    '| id | tipo | tentativa | resultado | evidência | XP |', '|---|---|---|---|---|---|', '',
    '## Competências', '', '| id | nível | evidência |', '|---|---|---|', '',
    '## Checkpoints', '', '| id | resultado | evidência |', '|---|---|---|', '',
    '## Feedback', '', '## Pendências', '', '- nenhuma', '', '## Próxima missão', '', '',
  ].join('\n'));
  return path.relative(raiz, arquivo).split(path.sep).join('/');
}

export function criarAluno(raiz, config, slugAluno, nome) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slugAluno)) throw new Error('slug inválido: use minúsculas, números e hífen');
  const dir = path.join(raiz, 'academia', 'alunos', slugAluno);
  if (fs.existsSync(dir)) throw new Error(`academia/alunos/${slugAluno} já existe`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'perfil.md'), [
    '---', `slug: ${slugAluno}`, `nome: ${nome}`, 'compartilhar_xp: nao', 'ritmo: ', 'assistente: ', '---', '',
    `# Perfil · ${nome}`, '',
    '> Preencha na Missão 0 (modelo e orientações: academia/templates/perfil-aluno.md).', '',
    '## Objetivo com o curso', '', '## Ponto de partida', '', '## Preferências de estudo', '', '## Ambiente', '', '',
  ].join('\n'));
  gerarRegistros(raiz, config);
  return `academia/alunos/${slugAluno}`;
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------
const AJUDA = `Uso: node academia/ferramentas/academia.mjs <comando>

  validar                       confere conteúdo, links, segredos e registros dos alunos
  progresso [--check]           recria (ou só confere) retomada.md e PROGRESS.md
  sessao <aluno> [--etapa N] [--data AAAA-MM-DD]
                                cria o arquivo da próxima sessão do aluno
  novo-aluno <slug> "Nome"      cria a pasta e o perfil de um aluno`;

function imprimir(lista, rotulo) {
  for (const i of lista) console.log(`${rotulo} ${i.arquivo}: ${i.mensagem}`);
}

export function main(argv, raiz = RAIZ_PADRAO) {
  const [cmd, ...args] = argv;
  const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
  if (!cmd || cmd === 'ajuda' || cmd === '--help') { console.log(AJUDA); return 0; }

  if (cmd === 'validar') {
    const { erros, config } = validarTudo(raiz);
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
    const checar = args.includes('--check');
    const { erros } = gerarRegistros(raiz, config, { somenteChecar: checar });
    if (erros.length) { imprimir(erros, 'erro'); return 1; }
    console.log(checar ? 'Registros atualizados.' : 'Registros gerados.');
    return 0;
  }
  try {
    if (cmd === 'sessao') {
      if (!args[0]) throw new Error('uso: sessao <aluno>');
      const etapa = opcao('--etapa');
      if (etapa !== undefined && !(Number.isInteger(Number(etapa)) && Number(etapa) >= 0 && Number(etapa) <= config.etapas.length)) {
        throw new Error('--etapa deve ser um inteiro de 0 a 16');
      }
      const data = opcao('--data');
      if (data !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('--data deve ser AAAA-MM-DD');
      console.log(`Criado ${criarSessao(raiz, config, args[0], { etapa: etapa === undefined ? undefined : Number(etapa), data })}`);
      return 0;
    }
    if (cmd === 'novo-aluno') {
      if (!args[0] || !args[1]) throw new Error('uso: novo-aluno <slug> "Nome"');
      console.log(`Criado ${criarAluno(raiz, config, args[0], args[1])}`);
      return 0;
    }
  } catch (e) {
    console.error(`erro: ${e.message}`);
    return 1;
  }
  console.error(`comando desconhecido: ${cmd}\n\n${AJUDA}`);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
