// Verificador do laboratório da Lição 1. Confere os critérios de aceitação CA1–CA8 da entrega, offline:
// nenhum LLM é chamado. Ele valida a COERÊNCIA do que você registrou: recalcula cada número derivado a partir das
// chamadas, compara os textos e os parâmetros com os do kit (kit/textos.mjs) e confere faixas plausíveis.
//
// O que ele NÃO faz: provar que você chamou um modelo de verdade nem avaliar a sua explicação (isso é a rubrica).
// O sistema de XP é, em última instância, um acordo de honestidade; veja academia/GAMIFICACAO.md.
//
//   node academia/licoes/01-tokens-contexto-inferencia/verificar.mjs academia/alunos/<aluno>/entregas/etapa-01
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { acharSegredos, ehPrincipal } from '../../ferramentas/comum.mjs';
import {
  FATO, MAX_TOKENS_CURTO, MAX_TOKENS_LONGO, MAX_TOKENS_MEDICAO, MAX_TOKENS_TRUNCAMENTO, REPETICOES, TEXTO_EN, TEXTO_PT,
} from './kit/textos.mjs';

const CHARS_REPETIDOS = REPETICOES.map((n) => Array(n).fill(TEXTO_PT).join('\n\n').length);

const ehInteiro = (n, min = 0) => Number.isInteger(n) && n >= min;
const ehObjeto = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const perto = (a, b, tolRel = 0.01, tolAbs = 1e-9) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(tolAbs, tolRel * Math.abs(b));

function secao(markdown, titulo) {
  const linhas = markdown.split(/\r?\n/);
  const inicio = linhas.findIndex((l) => l.trim().toLowerCase() === `## ${titulo}`.toLowerCase());
  if (inicio < 0) return null;
  const fim = linhas.findIndex((l, i) => i > inicio && /^## /.test(l));
  return linhas.slice(inicio + 1, fim < 0 ? undefined : fim).join('\n');
}

/** Letras e números do texto do aluno, sem os comentários do template (linhas ">" e comentários HTML). */
function conteudoUtil(texto) {
  const semModelo = texto.split(/\r?\n/).filter((l) => !l.trim().startsWith('>')).join('\n').replace(/<!--[\s\S]*?-->/g, '');
  return (semModelo.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

export async function verificar(pasta) {
  const resultados = [];
  const avisos = [];
  const criterio = (id, titulo, problemas) => resultados.push({ id, titulo, ok: problemas.length === 0, problemas });

  let textoJson;
  try {
    textoJson = await readFile(path.join(pasta, 'relatorio.json'), 'utf8');
  } catch {
    criterio('CA1', 'relatorio.json existe e é JSON válido', [`não encontrei ${path.join(pasta, 'relatorio.json')}`]);
    return { resultados, avisos };
  }
  let r;
  try {
    r = JSON.parse(textoJson);
  } catch (e) {
    criterio('CA1', 'relatorio.json existe e é JSON válido', [`JSON inválido: ${e.message}`]);
    return { resultados, avisos };
  }
  if (!ehObjeto(r)) {
    criterio('CA1', 'relatorio.json existe e é JSON válido', ['o relatório deve ser um objeto JSON']);
    return { resultados, avisos };
  }

  // CA1 · estrutura, ambiente, chamadas e script de medição.
  const p1 = [];
  if (r.versao !== 1) p1.push('`versao` deve ser 1');
  const amb = ehObjeto(r.ambiente) ? r.ambiente : {};
  try {
    const u = new URL(amb.base_url);
    if (u.username || u.password || u.search) p1.push('`ambiente.base_url` não pode conter usuário, senha nem query string');
  } catch {
    p1.push('`ambiente.base_url` deve ser uma URL');
  }
  if (typeof amb.modelo !== 'string' || !amb.modelo) p1.push('`ambiente.modelo` ausente');
  const chamadas = Array.isArray(r.chamadas) ? r.chamadas : [];
  if (chamadas.length < 12) p1.push(`mínimo de 12 chamadas registradas (há ${chamadas.length})`);
  const porId = new Map();
  for (const c of chamadas) {
    if (!ehObjeto(c) || typeof c.id !== 'string' || !c.id) { p1.push('toda chamada precisa ser um objeto com `id`'); continue; }
    if (porId.has(c.id)) p1.push(`id de chamada repetido: ${c.id}`);
    porId.set(c.id, c);
    if (!ehInteiro(c.prompt_tokens, 1)) p1.push(`${c.id}: prompt_tokens deve ser inteiro > 0`);
    if (!ehInteiro(c.completion_tokens)) p1.push(`${c.id}: completion_tokens deve ser inteiro >= 0`);
    if (c.total_tokens !== c.prompt_tokens + c.completion_tokens) p1.push(`${c.id}: total_tokens != prompt + completion`);
    if (typeof c.finish_reason !== 'string' || !c.finish_reason) p1.push(`${c.id}: finish_reason ausente`);
    if (!(typeof c.latencia_ms === 'number' && c.latencia_ms > 0)) p1.push(`${c.id}: latencia_ms deve ser um número > 0`);
    if (!ehInteiro(c.max_tokens, 1)) p1.push(`${c.id}: max_tokens deve ser inteiro > 0`);
  }
  // O script de medição pode estar em qualquer linguagem: medir.mjs, medir.py, medir.ts...
  let scriptDeMedicao = null;
  try {
    scriptDeMedicao = (await readdir(pasta)).find((f) => /^medir\.[a-z0-9]+$/i.test(f)) ?? null;
  } catch { /* pasta ilegível: o relatório.json já teria falhado acima */ }
  if (!scriptDeMedicao) p1.push(`entregue também o seu script de medição (medir.mjs, medir.py, medir.ts...) em ${pasta}`);
  criterio('CA1', 'Relatório válido: ambiente, ≥ 12 chamadas com contagens coerentes e o script de medição', p1);

  const exp = ehObjeto(r.experimentos) ? r.experimentos : {};
  const chamada = (id) => porId.get(id);
  const maxEsperado = (c, esperado, rotulo, lista) => {
    if (c && c.max_tokens !== esperado) lista.push(`${rotulo}: max_tokens deve ser ${esperado} (veja o kit)`);
  };

  // CA2 · idioma.
  const p2 = [];
  const i = ehObjeto(exp.idioma) ? exp.idioma : {};
  const pt = chamada(i.chamada_pt);
  const en = chamada(i.chamada_en);
  if (!pt || !en) p2.push('`idioma.chamada_pt` e `idioma.chamada_en` devem apontar chamadas registradas');
  else if (pt === en) p2.push('as chamadas de português e de inglês devem ser chamadas diferentes');
  if (i.chars_pt !== TEXTO_PT.length) p2.push(`chars_pt deve ser ${TEXTO_PT.length} (tamanho de TEXTO_PT no kit)`);
  if (i.chars_en !== TEXTO_EN.length) p2.push(`chars_en deve ser ${TEXTO_EN.length} (tamanho de TEXTO_EN no kit)`);
  if (pt && en && pt !== en) {
    maxEsperado(pt, MAX_TOKENS_MEDICAO, pt.id, p2);
    maxEsperado(en, MAX_TOKENS_MEDICAO, en.id, p2);
    if (!perto(i.razao_tokens_pt_en, pt.prompt_tokens / en.prompt_tokens, 0.001)) {
      p2.push(`razao_tokens_pt_en deveria ser ${(pt.prompt_tokens / en.prompt_tokens).toFixed(4)} (prompt_tokens pt / en)`);
    }
  }
  criterio('CA2', 'Idioma: textos e parâmetros do kit; razão de tokens PT/EN recalculada confere', p2);

  // CA3 · crescimento do prompt e custo fixo.
  const p3 = [];
  const g = ehObjeto(exp.crescimento) ? exp.crescimento : {};
  const ids = Array.isArray(g.chamadas) ? g.chamadas : [];
  const chars = Array.isArray(g.chars) ? g.chars : [];
  const cs = ids.map(chamada);
  if (ids.length !== REPETICOES.length || cs.some((c) => !c)) p3.push(`\`crescimento.chamadas\` deve listar ${REPETICOES.length} chamadas registradas`);
  else if (chars.length !== ids.length) p3.push('`crescimento.chars` deve ter um valor por chamada');
  else {
    if (chars.join() !== CHARS_REPETIDOS.join()) p3.push(`crescimento.chars deve ser [${CHARS_REPETIDOS.join(', ')}] (TEXTO_PT repetido ${REPETICOES.join(', ')} vezes, separado por \\n\\n)`);
    cs.forEach((c, k) => maxEsperado(c, MAX_TOKENS_MEDICAO, ids[k], p3));
    for (let k = 1; k < ids.length; k++) {
      if (cs[k].prompt_tokens < cs[k - 1].prompt_tokens) p3.push('prompt_tokens não deve diminuir quando o prompt cresce');
    }
    const dChars = chars.at(-1) - chars[0];
    const dTok = cs.at(-1).prompt_tokens - cs[0].prompt_tokens;
    const inclinacao = dTok / dChars;
    const overhead = cs[0].prompt_tokens - inclinacao * chars[0];
    if (!(inclinacao >= 0.05 && inclinacao <= 1.5)) p3.push(`a inclinação (${Number.isFinite(inclinacao) ? inclinacao.toFixed(3) : 'inválida'} token por caractere) está fora do plausível (0,05 a 1,5)`);
    if (!perto(g.tokens_por_char_marginal, inclinacao, 0.01)) {
      p3.push(`tokens_por_char_marginal deveria ser ${inclinacao.toFixed(5)} ((tokens_final − tokens_inicial) / (chars_final − chars_inicial))`);
    }
    if (!perto(g.overhead_fixo_tokens, overhead, 0, 0.5)) {
      p3.push(`overhead_fixo_tokens deveria ser ${overhead.toFixed(2)} (tokens_inicial − inclinação × chars_inicial)`);
    }
  }
  criterio('CA3', 'Crescimento: textos do kit; inclinação (tokens/caractere) e custo fixo recalculados conferem', p3);

  // CA4 · truncamento.
  const p4 = [];
  const t = ehObjeto(exp.truncamento) ? exp.truncamento : {};
  const ct = chamada(t.chamada);
  if (!ct) p4.push('`truncamento.chamada` deve apontar uma chamada registrada');
  else {
    if (ct.finish_reason !== 'length') p4.push(`finish_reason deveria ser "length" (veio "${ct.finish_reason}")`);
    if (!(ct.completion_tokens >= 1 && ct.completion_tokens <= ct.max_tokens)) p4.push('completion_tokens deve estar entre 1 e max_tokens');
    maxEsperado(ct, MAX_TOKENS_TRUNCAMENTO, ct.id, p4);
    if (t.max_tokens !== ct.max_tokens) p4.push('`truncamento.max_tokens` deve ser igual ao max_tokens da chamada');
  }
  criterio('CA4', 'Truncamento: finish_reason "length" observado com max_tokens baixo', p4);

  // CA5 · a API não tem memória.
  const p5 = [];
  const m = ehObjeto(exp.sem_memoria) ? exp.sem_memoria : {};
  const sem = chamada(m.sem_historico);
  const com = chamada(m.com_historico);
  if (!sem || !com || sem === com) {
    p5.push('`sem_memoria` precisa de `sem_historico` e `com_historico` apontando duas chamadas registradas diferentes');
  } else {
    if (m.fato !== FATO) p5.push(`\`fato\` deve ser "${FATO}" (kit)`);
    maxEsperado(sem, MAX_TOKENS_CURTO, sem.id, p5);
    maxEsperado(com, MAX_TOKENS_CURTO, com.id, p5);
    const contem = (c) => typeof c.resposta === 'string' && c.resposta.toLowerCase().includes(FATO.toLowerCase());
    if (typeof sem.resposta !== 'string' || typeof com.resposta !== 'string') p5.push('as chamadas de memória devem registrar a `resposta`');
    if (m.sem_historico_lembrou !== contem(sem)) p5.push('`sem_historico_lembrou` não confere com a resposta registrada');
    if (m.com_historico_lembrou !== contem(com)) p5.push('`com_historico_lembrou` não confere com a resposta registrada');
    if (m.sem_historico_lembrou !== false) p5.push('sem reenviar o histórico o modelo não pode ter acesso ao fato (`sem_historico_lembrou` deve ser false)');
    if (!(com.prompt_tokens > sem.prompt_tokens)) p5.push('reenviar o histórico deve aumentar o prompt_tokens');
    if (m.tokens_extra_do_historico !== com.prompt_tokens - sem.prompt_tokens) {
      p5.push(`tokens_extra_do_historico deveria ser ${com.prompt_tokens - sem.prompt_tokens}`);
    }
    if (m.com_historico_lembrou === false) {
      avisos.push('Com o histórico reenviado o modelo não citou o fato: modelos pequenos falham às vezes. Explique no relatório (seção "Surpresas e limites").');
    }
  }
  criterio('CA5', 'Sem memória: sem histórico não lembra; o histórico custa tokens', p5);

  // CA6 · decodificação.
  const p6 = [];
  const d = ehObjeto(exp.decodificacao) ? exp.decodificacao : {};
  const curta = chamada(d.curta);
  const longa = chamada(d.longa);
  if (!curta || !longa || curta === longa) p6.push('`decodificacao.curta` e `.longa` devem apontar duas chamadas registradas diferentes');
  else {
    maxEsperado(curta, MAX_TOKENS_CURTO, curta.id, p6);
    maxEsperado(longa, MAX_TOKENS_LONGO, longa.id, p6);
    if (!(longa.completion_tokens > curta.completion_tokens)) p6.push('a chamada longa deve gerar mais tokens de saída que a curta');
    else {
      const esperado = (longa.latencia_ms - curta.latencia_ms) / (longa.completion_tokens - curta.completion_tokens);
      if (!perto(d.ms_por_token_saida, esperado, 0.01, 1e-6)) p6.push(`ms_por_token_saida deveria ser ${esperado.toFixed(2)}`);
      if (esperado <= 0) avisos.push('A chamada longa não demorou mais que a curta (ruído, cache ou fila no servidor). Repita a medição e comente.');
    }
  }
  criterio('CA6', 'Decodificação: mais tokens de saída, ms por token recalculado', p6);

  // CA7 · segredos (relatório, relatório do aluno e o próprio medir.mjs).
  const p7 = [];
  const lerOpcional = async (arq) => { try { return await readFile(path.join(pasta, arq), 'utf8'); } catch { return null; } };
  const md = await lerOpcional('relatorio.md');
  const codigo = scriptDeMedicao ? await lerOpcional(scriptDeMedicao) : null;
  for (const [arq, texto] of [['relatorio.json', textoJson], ['relatorio.md', md], [scriptDeMedicao ?? 'medir', codigo]]) {
    if (texto === null) continue;
    for (const s of acharSegredos(texto.replace(/\r\n?/g, '\n'))) p7.push(`${arq}:${s.linha}: possível segredo (${s.nome}); remova e troque a credencial`);
  }
  criterio('CA7', 'Nenhuma chave, token ou segredo em relatorio.json, relatorio.md e no script de medição', p7);

  // CA8 · relatório do aluno.
  const p8 = [];
  if (md === null) p8.push(`não encontrei ${path.join(pasta, 'relatorio.md')}`);
  else {
    for (const [titulo, min] of [['Resultados', 120], ['Explicação', 320], ['Surpresas e limites', 120]]) {
      const corpo = secao(md, titulo);
      if (corpo === null) p8.push(`falta a seção "## ${titulo}"`);
      else if (conteudoUtil(corpo) < min) p8.push(`a seção "${titulo}" precisa de pelo menos ${min} letras ou números escritos por você (os comentários do modelo não contam)`);
    }
  }
  criterio('CA8', 'relatorio.md com Resultados, Explicação e Surpresas e limites preenchidos', p8);

  return { resultados, avisos };
}

function imprimir({ resultados, avisos }, pasta) {
  console.log(`Lição 1 · verificação de ${pasta}\n`);
  for (const c of resultados) {
    console.log(`${c.ok ? '[ok]    ' : '[falhou]'} ${c.id} · ${c.titulo}`);
    for (const p of c.problemas) console.log(`           - ${p}`);
  }
  if (avisos.length) {
    console.log('\nAvisos (não reprovam):');
    for (const a of avisos) console.log(`  - ${a}`);
  }
  const ok = resultados.filter((c) => c.ok).length;
  console.log(`\n${ok}/${resultados.length} critérios cumpridos. (Coerência, não prova de honestidade: veja o início deste arquivo.)`);
  return ok === resultados.length;
}

if (ehPrincipal(import.meta.url)) {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error('uso: node verificar.mjs <pasta-da-entrega>   (precisa de relatorio.json, relatorio.md e o script medir.*)');
    process.exit(2);
  }
  const res = await verificar(path.resolve(pasta));
  process.exit(imprimir(res, pasta) ? 0 : 1);
}
