// Validação do catálogo "Productivity Hacks" (academia/extensoes/productivity-hacks) e do bloco 15.6 das lições.
// Sem dependências (Node 22+). Chamado por `academia.mjs validar`.
//
// O que é conferido (e por quê):
//   - cada dica (`### PH-XXX-NN · Título`) tem o parágrafo "Sabia que você pode ... para melhorar ...?" e os campos Faça, Tempo e custo,
//     Cuidado, Entra em, Vira projeto? e Fontes: sem eles a dica vira propaganda (sem o "Cuidado" e as "Fontes" ninguém sabe o risco nem a origem);
//   - numeração sem buraco nem repetição, e o código da trilha bate com o arquivo;
//   - "Entra em" aponta para etapas que existem; "Vira projeto?" e as "Dicas" de cada projeto se referem uns aos outros (nada órfão);
//   - toda fonte com URL traz a marca [verificado] ou [não verificado]; o que é opinião diz [opinião];
//   - o bloco 15.6 de cada lição cita uma dica que EXISTE no catálogo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ehPrincipal } from './comum.mjs';

export const DIR_PH = 'academia/extensoes/productivity-hacks';
export const TRILHAS = { voz: 'VOZ', 'email-e-agenda': 'EMA', automacoes: 'AUT', telegram: 'TEL', ganhar: 'GAN' };
const ARQUIVO_PROJETOS = 'projetos-que-rendem.md';
const CODIGOS = Object.values(TRILHAS);
const ID_DICA = new RegExp(`(?<![A-Za-z0-9-])PH-(?:${CODIGOS.join('|')})-\\d{2}(?!\\d)`, 'g');
const ID_PROJETO = /(?<![A-Za-z0-9-])PP-\d{2}(?!\d)/g;
const ETAPAS = 16;
const CAMPOS_DICA = ['Faça:', 'Tempo e custo:', 'Cuidado:', 'Entra em:', 'Vira projeto?', 'Fontes:'];
const CAMPOS_PROJETO = ['Tempo:', 'O que se ganha:', 'Dicas:', 'Critérios de aceitação:', 'Riscos:'];
const MIN_CRITERIOS = 4;

const ler = (arq) => fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
/** Lê um arquivo do catálogo; se não der (é uma pasta, sem permissão), devolve null e registra o erro em vez de lançar. */
function lerSeguro(abs, rel, erros) {
  try { return ler(abs); } catch (err) { erros.push({ arquivo: rel, mensagem: `não consegui ler o arquivo (${err.code ?? 'erro'})` }); return null; }
}
/** Troca o conteúdo de blocos de código por linhas vazias (mantém a contagem de linhas para apontar o erro). */
function semCodigo(t) {
  let cerca = null; // { c: '`' | '~', n: tamanho }
  return String(t).split('\n').map((l) => {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(l);
    if (cerca) {
      if (m && m[1][0] === cerca.c && m[1].length >= cerca.n && /^\s*$/.test(l.slice(m[0].length))) cerca = null;
      return '';
    }
    if (m) { cerca = { c: m[1][0], n: m[1].length }; return ''; }
    return l;
  }).join('\n');
}

/** Divide em cartões: cada `### ...` até o próximo título de nível 1 a 3. Devolve [{titulo, linha, corpo}]. */
function cartoes(texto) {
  const linhas = semCodigo(texto).split('\n');
  const saida = [];
  let atual = null;
  let secao = '';
  linhas.forEach((l, i) => {
    if (/^## /.test(l)) secao = l.replace(/^## /, '').trim();
    if (/^ {0,3}#{4,6}\s+(?:PH|PP)-/.test(l)) saida.push({ titulo: l.replace(/^ {0,3}#+\s*/, '').trim(), linha: i + 1, linhas: [], nivelErrado: true });
    if (/^#{1,3} /.test(l)) {
      if (atual) saida.push(atual);
      atual = /^### /.test(l) ? { titulo: l.replace(/^### /, '').trim(), linha: i + 1, linhas: [], secao } : null;
    } else if (atual) atual.linhas.push(l);
  });
  if (atual) saida.push(atual);
  return saida.map((c) => ({ titulo: c.titulo, linha: c.linha, corpo: c.linhas.join('\n'), secao: c.secao ?? '', nivelErrado: Boolean(c.nivelErrado) }));
}

/** O texto de um campo "- **Rótulo** ..." (a linha do rótulo e as seguintes até o próximo campo ou o fim). */
function campo(corpo, rotulo) {
  const re = new RegExp(`^- \\*\\*${rotulo.replace(/[?.]/g, '\\$&')}\\*\\*`, 'gm');
  const achados = [...corpo.matchAll(re)];
  if (achados.length !== 1) return { quantos: achados.length, texto: '' };
  const resto = corpo.slice(achados[0].index + achados[0][0].length);
  const fim = resto.search(/^- \*\*/m);
  return { quantos: 1, texto: (fim < 0 ? resto : resto.slice(0, fim)).trim() };
}

/**
 * Lê o catálogo. Devolve as dicas (id -> {arquivo, linha, titulo, corpo}), os projetos (id -> {...}) e a lista de erros de LEITURA
 * (arquivo faltando). A conferência detalhada é de `validarProdutividade`.
 */
export function lerCatalogo(raiz) {
  const dicas = new Map();
  const projetos = new Map();
  const erros = [];
  const base = path.join(raiz, DIR_PH);
  if (!fs.existsSync(base)) return { dicas, projetos, erros, existe: false };
  for (const [arquivo, codigo] of Object.entries(TRILHAS)) {
    const rel = `${DIR_PH}/trilhas/${arquivo}.md`;
    const abs = path.join(raiz, rel);
    if (!fs.existsSync(abs)) { erros.push({ arquivo: rel, mensagem: 'trilha não encontrada' }); continue; }
    const texto = lerSeguro(abs, rel, erros);
    if (texto === null) continue;
    for (const c of cartoes(texto)) {
      if (c.nivelErrado) { erros.push({ arquivo: `${rel}:${c.linha}`, mensagem: `título de dica no nível errado (use "### PH-XXX-NN · Título", com três #): ${JSON.stringify(c.titulo.slice(0, 60))}` }); continue; }
      const m = c.titulo.match(/^(PH-[A-Z]{3}-\d{2}) · (.+)$/);
      if (!m) {
        if (/^\s*PH-/i.test(c.titulo) || /^#+\s*PH-/.test(c.titulo)) erros.push({ arquivo: `${rel}:${c.linha}`, mensagem: `título de dica fora do padrão (use "### PH-XXX-NN · Título", com o ponto médio e dois dígitos): ${JSON.stringify(c.titulo.slice(0, 60))}` });
        continue;
      }
      if (dicas.has(m[1])) { erros.push({ arquivo: `${rel}:${c.linha}`, mensagem: `id repetido: ${m[1]}` }); continue; }
      if (c.secao !== 'Dicas') { erros.push({ arquivo: `${rel}:${c.linha}`, mensagem: `${m[1]}: a dica está fora da seção "## Dicas" (está em "## ${c.secao || '(sem seção)'}")` }); continue; }
      dicas.set(m[1], { arquivo: rel, linha: c.linha, titulo: m[2], codigo, corpo: c.corpo, tituloCompleto: c.titulo });
    }
  }
  const relP = `${DIR_PH}/${ARQUIVO_PROJETOS}`;
  const absP = path.join(raiz, relP);
  if (!fs.existsSync(absP)) erros.push({ arquivo: relP, mensagem: 'arquivo de projetos não encontrado' });
  else {
    const textoP = lerSeguro(absP, relP, erros);
    for (const c of cartoes(textoP ?? '')) {
      if (c.nivelErrado) { erros.push({ arquivo: `${relP}:${c.linha}`, mensagem: `título de projeto no nível errado (use "### PP-NN · Título", com três #): ${JSON.stringify(c.titulo.slice(0, 60))}` }); continue; }
      const m = c.titulo.match(/^(PP-\d{2}) · (.+)$/);
      if (!m) {
        if (/^\s*PP-/i.test(c.titulo)) erros.push({ arquivo: `${relP}:${c.linha}`, mensagem: `título de projeto fora do padrão (use "### PP-NN · Título"): ${JSON.stringify(c.titulo.slice(0, 60))}` });
        continue;
      }
      if (projetos.has(m[1])) { erros.push({ arquivo: `${relP}:${c.linha}`, mensagem: `id repetido: ${m[1]}` }); continue; }
      projetos.set(m[1], { arquivo: relP, linha: c.linha, titulo: m[2], corpo: c.corpo, tituloCompleto: c.titulo });
    }
  }
  return { dicas, projetos, erros, existe: true };
}

/** Texto do bloco 15.6 de uma lição (vazio se não houver). */
export function blocoHack(textoLicao) {
  const t = semCodigo(String(textoLicao).replace(/\r\n?/g, '\n'));
  const i = t.search(/^### 15\.6\b/m);
  if (i < 0) return '';
  const resto = t.slice(i).split('\n').slice(1).join('\n');
  const fim = resto.search(/^#{1,3} /m);
  return (fim < 0 ? resto : resto.slice(0, fim)).trim();
}

function sequencia(ids, prefixo, rel, linhas, erros) {
  ids.forEach((id, i) => {
    const n = Number(id.slice(-2));
    if (n !== i + 1) erros.push({ arquivo: `${rel}:${linhas[i]}`, mensagem: `${id}: a numeração deve seguir ${prefixo}-${String(i + 1).padStart(2, '0')} (sem buracos nem fora de ordem)` });
  });
}

export function validarProdutividade(raiz) {
  const { dicas, projetos, erros, existe } = lerCatalogo(raiz);
  if (!existe) return [];
  const e = (arquivo, mensagem) => erros.push({ arquivo, mensagem });
  const citadosPorDicas = new Map(); // PP -> Set<PH>

  for (const [arquivo, codigo] of Object.entries(TRILHAS)) {
    const rel = `${DIR_PH}/trilhas/${arquivo}.md`;
    const daTrilha = [...dicas.entries()].filter(([, d]) => d.arquivo === rel);
    if (daTrilha.length === 0) { if (fs.existsSync(path.join(raiz, rel))) e(rel, `a trilha não tem nenhuma dica (### PH-${codigo}-01 · ...)`); continue; }
    for (const [id, d] of daTrilha) {
      const onde = `${rel}:${d.linha}`;
      if (!id.startsWith(`PH-${codigo}-`)) e(onde, `${id}: o código da trilha ${arquivo}.md é PH-${codigo}-NN`);
      if (d.titulo.length > 90) e(onde, `${id}: título longo demais (até 90 caracteres)`);
      // parágrafo "Sabia que você pode ... para melhorar ...?"
      const paragrafo = d.corpo.split('\n').reduce((acc, l) => (acc.fim ? acc : l.trim() === '' ? (acc.texto ? { ...acc, fim: true } : acc) : { texto: `${acc.texto} ${l.trim()}`.trim() }), { texto: '' }).texto;
      if (!paragrafo.startsWith('**Sabia que você pode**')) e(onde, `${id}: o texto logo abaixo do título deve começar com "**Sabia que você pode**"`);
      else {
        if (!paragrafo.includes('**para melhorar**')) e(onde, `${id}: falta "**para melhorar**" (o resultado que o aluno consegue medir)`);
        if (!paragrafo.endsWith('?')) e(onde, `${id}: a frase "Sabia que você pode ... ?" deve terminar com ?`);
      }
      const valores = {};
      for (const c of CAMPOS_DICA) {
        const r = campo(d.corpo, c);
        valores[c] = r.texto;
        if (r.quantos === 0) e(onde, `${id}: falta o campo "- **${c}**"`);
        else if (r.quantos > 1) e(onde, `${id}: o campo "${c}" aparece mais de uma vez`);
        else if (r.texto === '') e(onde, `${id}: o campo "${c}" está vazio`);
      }
      const entra = valores['Entra em:'];
      if (entra) {
        const etapas = [...entra.matchAll(/etapa\s+(\d+)/gi)].map((m) => Number(m[1]));
        const ok = /qualquer momento/i.test(entra) || /miss[ãa]o\s+0/i.test(entra) || etapas.length > 0;
        if (!ok) e(onde, `${id}: "Entra em" deve dizer "qualquer momento", "Missão 0" ou "etapa N"`);
        if (etapas.some((n) => n < 1 || n > ETAPAS)) e(onde, `${id}: "Entra em" cita uma etapa fora de 1 a ${ETAPAS}`);
      }
      const proj = valores['Vira projeto?'];
      if (proj) {
        const ids = proj.match(ID_PROJETO) ?? [];
        if (/^n[ãa]o\b/i.test(proj)) { if (ids.length) e(onde, `${id}: "Vira projeto?" diz não, mas cita ${ids.join(', ')}`); }
        else if (/^sim\b/i.test(proj)) {
          if (!ids.length) e(onde, `${id}: "Vira projeto?" diz sim, mas não cita o projeto (PP-NN)`);
          for (const p of ids) {
            if (!projetos.has(p)) e(onde, `${id}: o projeto ${p} não existe em ${ARQUIVO_PROJETOS}`);
            else citadosPorDicas.set(p, (citadosPorDicas.get(p) ?? new Set()).add(id));
          }
        } else e(onde, `${id}: "Vira projeto?" deve começar com "não" ou "sim: PP-NN"`);
      }
      const fontes = valores['Fontes:'];
      if (fontes) {
        const urls = [...fontes.matchAll(/https:\/\/[^\s;\]\[]+/g)];
        if (urls.length === 0 && !/\[opinião\]/i.test(fontes)) e(onde, `${id}: "Fontes" precisa de uma URL https ou da marca [opinião]`);
        for (const u of urls) {
          const depois = fontes.slice(u.index + u[0].length, u.index + u[0].length + 40);
          if (!/^\s*\[(?:não )?verificado/i.test(depois)) e(onde, `${id}: a fonte ${u[0].slice(0, 60)} precisa da marca [verificado] ou [não verificado] logo depois da URL`);
        }
      }
    }
    sequencia(daTrilha.map(([id]) => id), `PH-${codigo}`, rel, daTrilha.map(([, d]) => d.linha), erros);
    // a seção "Projetos desta trilha" lista exatamente os projetos que as dicas da trilha citam
    const textoTrilha = lerSeguro(path.join(raiz, rel), rel, erros) ?? '';
    const secProj = /^## Projetos desta trilha\n([\s\S]*?)(?=^## |\Z)/m.exec(semCodigo(textoTrilha));
    const listados = new Set(secProj ? secProj[1].match(ID_PROJETO) ?? [] : []);
    const citados = new Set(daTrilha.flatMap(([, d]) => campo(d.corpo, 'Vira projeto?').texto.match(ID_PROJETO) ?? []));
    for (const p of citados) if (!listados.has(p)) e(rel, `a seção "Projetos desta trilha" não lista ${p}, que uma dica da trilha cita`);
    for (const p of listados) if (!citados.has(p)) e(rel, `a seção "Projetos desta trilha" lista ${p}, mas nenhuma dica da trilha o cita`);
  }

  const relP = `${DIR_PH}/${ARQUIVO_PROJETOS}`;
  const listaP = [...projetos.keys()];
  sequencia(listaP, 'PP', relP, [...projetos.values()].map((p) => p.linha), erros);
  for (const [id, p] of projetos) {
    const onde = `${relP}:${p.linha}`;
    const valores = {};
    for (const c of CAMPOS_PROJETO) {
      const r = campo(p.corpo, c);
      valores[c] = r.texto;
      if (r.quantos !== 1) e(onde, `${id}: falta (ou repete) o campo "- **${c}**"`);
      else if (r.texto === '') e(onde, `${id}: o campo "${c}" está vazio`);
    }
    // (o texto do campo foi aparado: o primeiro item pode ter perdido a indentação, por isso `\s*`)
    const criterios = (valores['Critérios de aceitação:'].match(/^\s*\d+\.\s/gm) ?? []).length;
    if (valores['Critérios de aceitação:'] && criterios < MIN_CRITERIOS) e(onde, `${id}: os critérios de aceitação precisam de pelo menos ${MIN_CRITERIOS} itens numerados e testáveis (  1. ...)`);
    const ligadas = valores['Dicas:'].match(ID_DICA) ?? [];
    if (valores['Dicas:'] && ligadas.length === 0) e(onde, `${id}: o campo "Dicas" deve citar ao menos uma dica (PH-XXX-NN)`);
    for (const dica of ligadas) {
      if (!dicas.has(dica)) e(onde, `${id}: a dica ${dica} não existe`);
      else if (!citadosPorDicas.get(id)?.has(dica)) e(onde, `${id}: a dica ${dica} não aponta de volta para este projeto (no campo "Vira projeto?" dela)`);
    }
    for (const dica of citadosPorDicas.get(id) ?? []) if (!ligadas.includes(dica)) e(onde, `${id}: a dica ${dica} cita este projeto, mas ele não a lista em "Dicas"`);
    if (!citadosPorDicas.has(id)) e(onde, `${id}: nenhuma dica leva a este projeto (projeto órfão)`);
  }

  // o mapa "quando fazer cada dica" do README é gerado do catálogo: precisa estar em dia
  const relR = `${DIR_PH}/README.md`;
  const absR = path.join(raiz, relR);
  if (!fs.existsSync(absR)) e(relR, 'README do catálogo não encontrado');
  else {
    const r = aplicarMapa(lerSeguro(absR, relR, erros) ?? '', gerarMapaPorEtapa(dicas));
    // a tabela das trilhas do README (nº de dicas e projetos) precisa bater com o catálogo
    const readme = lerSeguro(absR, relR, erros) ?? '';
    for (const [arquivo] of Object.entries(TRILHAS)) {
      const linha = readme.split('\n').find((l) => l.includes(`(trilhas/${arquivo}.md)`) && l.startsWith('|'));
      if (!linha) { e(relR, `a tabela de trilhas do README não tem a linha de ${arquivo}.md`); continue; }
      const celulas = linha.split('|').map((c) => c.trim()).filter(Boolean);
      const doCatalogo = [...dicas.values()].filter((d) => d.arquivo.endsWith(`/trilhas/${arquivo}.md`));
      const projetosDaTrilha = new Set(doCatalogo.flatMap((d) => campo(d.corpo, 'Vira projeto?').texto.match(ID_PROJETO) ?? []));
      const nDicas = Number(celulas.at(-2));
      const listados = new Set(celulas.at(-1).match(ID_PROJETO) ?? []);
      if (nDicas !== doCatalogo.length) e(relR, `a tabela do README diz ${celulas.at(-2)} dicas para ${arquivo}.md, mas o catálogo tem ${doCatalogo.length}`);
      if ([...projetosDaTrilha].sort().join() !== [...listados].sort().join()) e(relR, `a tabela do README lista os projetos [${[...listados].sort().join(', ')}] para ${arquivo}.md, mas as dicas citam [${[...projetosDaTrilha].sort().join(', ')}]`);
    }
    if (!r) e(relR, `faltam as marcas do mapa por etapa (${MARCA_INICIO.slice(0, 30)}... e ${MARCA_FIM})`);
    else if (r.mudou) e(relR, 'o mapa por etapa está desatualizado: rode `node academia/ferramentas/produtividade.mjs mapa --escrever`');
  }
  return erros;
}

/** Grava o mapa no README (ou só o devolve com `escrever: false`). */
export function atualizarMapa(raiz, { escrever = true } = {}) {
  const { dicas } = lerCatalogo(raiz);
  const mapa = gerarMapaPorEtapa(dicas);
  if (!escrever) return mapa;
  const abs = path.join(raiz, DIR_PH, 'README.md');
  const r = aplicarMapa(ler(abs), mapa);
  if (!r) throw new Error('o README não tem as marcas do mapa por etapa');
  if (r.mudou) fs.writeFileSync(abs, r.texto);
  return mapa;
}

const MARCA_INICIO = '<!-- mapa-por-etapa:inicio (gerado por: node academia/ferramentas/produtividade.mjs mapa --escrever) -->';
const MARCA_FIM = '<!-- mapa-por-etapa:fim -->';
const ARQUIVO_DA_DICA = (d) => d.arquivo.replace(`${DIR_PH}/`, '');

/** "Quando fazer cada dica": as dicas agrupadas pelo campo "Entra em", em Markdown. Gerado do catálogo para não ficar desatualizado. */
export function gerarMapaPorEtapa(dicas) {
  const grupos = new Map();
  const poe = (chave, id, d) => grupos.set(chave, [...(grupos.get(chave) ?? []), [id, d]]);
  for (const [id, d] of dicas) {
    const valor = campo(d.corpo, 'Entra em:').texto;
    if (/qualquer momento/i.test(valor)) poe(-2, id, d);
    if (/miss[ãa]o\s+0/i.test(valor)) poe(-1, id, d);
    for (const m of valor.matchAll(/etapa\s+(\d+)/gi)) poe(Number(m[1]), id, d);
  }
  const rotulo = (k) => (k === -2 ? 'Qualquer momento' : k === -1 ? 'Missão 0' : `Etapa ${k}`);
  return [...grupos.keys()].sort((a, b) => a - b).map((k) => [
    `- **${rotulo(k)}:**`,
    ...[...new Map(grupos.get(k)).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, d]) => `  - [${id}](${ARQUIVO_DA_DICA(d)}) · ${d.titulo}`),
  ].join('\n')).join('\n');
}

/** Troca o trecho entre as marcas do README pelo mapa gerado. Devolve {texto, mudou}. */
function aplicarMapa(texto, mapa) {
  const i = texto.indexOf(MARCA_INICIO);
  const f = texto.indexOf(MARCA_FIM);
  if (i < 0 || f < i) return null;
  const novo = `${texto.slice(0, i + MARCA_INICIO.length)}\n${mapa}\n${texto.slice(f)}`;
  return { texto: novo, mudou: novo !== texto };
}

/** Confere o bloco 15.6 de uma lição. Devolve a lista de mensagens de erro (vazia se estiver certo). */
export function conferirBlocoHack(textoLicao, dicas) {
  const bloco = blocoHack(textoLicao).replace(/<!--[\s\S]*?-->/g, '');
  const problemas = [];
  if (!bloco) return ['falta o bloco 15.6 (Hack de produtividade)'];
  if (!bloco.includes('**Sabia que você pode**')) problemas.push('o bloco 15.6 deve conter "**Sabia que você pode**"');
  const ids = bloco.match(ID_DICA) ?? [];
  if (ids.length === 0) problemas.push('o bloco 15.6 deve citar uma dica do catálogo (PH-XXX-NN)');
  for (const id of new Set(ids)) if (!dicas.has(id)) problemas.push(`o bloco 15.6 cita ${id}, que não existe no catálogo`);
  return problemas;
}

// Uso: node academia/ferramentas/produtividade.mjs mapa [--escrever]
//   mapa              imprime o mapa "quando fazer cada dica"
//   mapa --escrever   grava o mapa no README do catálogo (entre as marcas)
if (ehPrincipal(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  if (cmd !== 'mapa' || args.some((a) => a !== '--escrever')) {
    console.error('uso: node academia/ferramentas/produtividade.mjs mapa [--escrever]');
    process.exitCode = 2;
  } else {
    try {
      const mapa = atualizarMapa(raiz, { escrever: args.includes('--escrever') });
      console.log(args.includes('--escrever') ? 'Mapa gravado no README do catálogo.' : mapa);
    } catch (e) {
      console.error(`erro: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
