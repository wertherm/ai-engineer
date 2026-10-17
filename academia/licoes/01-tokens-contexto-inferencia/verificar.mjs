// Verificador do laboratório da Lição 1. Confere os critérios de aceitação CA1–CA8 da entrega, offline:
// nenhum LLM é chamado. Ele valida o que você MEDIU, recalculando cada número derivado a partir das chamadas
// registradas. Não avalia a qualidade da sua explicação (isso é a rubrica).
//
//   node academia/licoes/01-tokens-contexto-inferencia/verificar.mjs academia/alunos/<aluno>/entregas/etapa-01
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SEGREDOS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /Bearer\s+[A-Za-z0-9._~+/-]{16,}/i,
  /api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/i,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
];

const ehInteiro = (n, min = 0) => Number.isInteger(n) && n >= min;
const perto = (a, b, tolRel = 0.01, tolAbs = 1e-9) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(tolAbs, tolRel * Math.abs(b));

function secao(markdown, titulo) {
  const linhas = markdown.split(/\r?\n/);
  const inicio = linhas.findIndex((l) => l.trim().toLowerCase() === `## ${titulo}`.toLowerCase());
  if (inicio < 0) return null;
  const fim = linhas.findIndex((l, i) => i > inicio && /^## /.test(l));
  return linhas.slice(inicio + 1, fim < 0 ? undefined : fim).join('\n').trim();
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

  // CA1 · estrutura, ambiente e chamadas.
  const p1 = [];
  if (r.versao !== 1) p1.push('`versao` deve ser 1');
  const amb = r.ambiente ?? {};
  try {
    const u = new URL(amb.base_url);
    if (u.username || u.password) p1.push('`ambiente.base_url` não pode conter usuário/senha');
  } catch {
    p1.push('`ambiente.base_url` deve ser uma URL');
  }
  if (typeof amb.modelo !== 'string' || !amb.modelo) p1.push('`ambiente.modelo` ausente');
  const chamadas = Array.isArray(r.chamadas) ? r.chamadas : [];
  if (chamadas.length < 12) p1.push(`mínimo de 12 chamadas registradas (há ${chamadas.length})`);
  const porId = new Map();
  for (const c of chamadas) {
    if (typeof c.id !== 'string' || !c.id) { p1.push('chamada sem `id`'); continue; }
    if (porId.has(c.id)) p1.push(`id de chamada repetido: ${c.id}`);
    porId.set(c.id, c);
    if (!ehInteiro(c.prompt_tokens, 1)) p1.push(`${c.id}: prompt_tokens deve ser inteiro > 0`);
    if (!ehInteiro(c.completion_tokens)) p1.push(`${c.id}: completion_tokens deve ser inteiro >= 0`);
    if (c.total_tokens !== c.prompt_tokens + c.completion_tokens) p1.push(`${c.id}: total_tokens != prompt + completion`);
    if (typeof c.finish_reason !== 'string' || !c.finish_reason) p1.push(`${c.id}: finish_reason ausente`);
    if (!(typeof c.latencia_ms === 'number' && c.latencia_ms >= 0)) p1.push(`${c.id}: latencia_ms inválida`);
    if (!ehInteiro(c.max_tokens, 1)) p1.push(`${c.id}: max_tokens deve ser inteiro > 0`);
  }
  criterio('CA1', 'Relatório válido: ambiente, ≥ 12 chamadas e contagens coerentes', p1);

  const exp = r.experimentos ?? {};
  const chamada = (id) => porId.get(id);

  // CA2 · idioma.
  const p2 = [];
  const i = exp.idioma ?? {};
  const pt = chamada(i.chamada_pt);
  const en = chamada(i.chamada_en);
  if (!pt || !en) p2.push('`idioma.chamada_pt` e `idioma.chamada_en` devem apontar chamadas registradas');
  if (!(i.chars_pt > 0 && i.chars_en > 0)) p2.push('`chars_pt` e `chars_en` devem ser > 0');
  if (pt && en && !perto(i.razao_tokens_pt_en, pt.prompt_tokens / en.prompt_tokens, 0.001)) {
    p2.push(`razao_tokens_pt_en deveria ser ${(pt.prompt_tokens / en.prompt_tokens).toFixed(4)} (prompt_tokens pt / en)`);
  }
  criterio('CA2', 'Idioma: razão de tokens PT/EN recalculada confere', p2);

  // CA3 · crescimento do prompt e custo fixo.
  const p3 = [];
  const g = exp.crescimento ?? {};
  const ids = Array.isArray(g.chamadas) ? g.chamadas : [];
  const chars = Array.isArray(g.chars) ? g.chars : [];
  const cs = ids.map(chamada);
  if (ids.length < 4 || cs.some((c) => !c)) p3.push('`crescimento.chamadas` deve listar ≥ 4 chamadas registradas');
  else if (chars.length !== ids.length) p3.push('`crescimento.chars` deve ter um valor por chamada');
  else {
    for (let k = 1; k < ids.length; k++) {
      if (!(chars[k] > chars[k - 1])) p3.push('`chars` deve ser estritamente crescente');
      if (cs[k].prompt_tokens < cs[k - 1].prompt_tokens) p3.push('prompt_tokens não deve diminuir quando o prompt cresce');
    }
    const dChars = chars.at(-1) - chars[0];
    const dTok = cs.at(-1).prompt_tokens - cs[0].prompt_tokens;
    const inclinacao = dTok / dChars;
    const overhead = cs[0].prompt_tokens - inclinacao * chars[0];
    if (!(inclinacao > 0)) p3.push('a inclinação (tokens por caractere) deve ser positiva');
    if (!perto(g.tokens_por_char_marginal, inclinacao, 0.01)) {
      p3.push(`tokens_por_char_marginal deveria ser ${inclinacao.toFixed(5)} ((tokens_final − tokens_inicial) / (chars_final − chars_inicial))`);
    }
    if (!perto(g.overhead_fixo_tokens, overhead, 0, 0.5)) {
      p3.push(`overhead_fixo_tokens deveria ser ${overhead.toFixed(2)} (tokens_inicial − inclinação × chars_inicial)`);
    }
  }
  criterio('CA3', 'Crescimento: inclinação (tokens/caractere) e custo fixo recalculados conferem', p3);

  // CA4 · truncamento.
  const p4 = [];
  const t = exp.truncamento ?? {};
  const ct = chamada(t.chamada);
  if (!ct) p4.push('`truncamento.chamada` deve apontar uma chamada registrada');
  else {
    if (ct.finish_reason !== 'length') p4.push(`finish_reason deveria ser "length" (veio "${ct.finish_reason}")`);
    if (ct.completion_tokens > ct.max_tokens) p4.push('completion_tokens maior que max_tokens');
    if (ct.max_tokens > 20) p4.push('use max_tokens <= 20 para forçar o corte');
    if (t.max_tokens !== ct.max_tokens) p4.push('`truncamento.max_tokens` deve ser igual ao max_tokens da chamada');
  }
  criterio('CA4', 'Truncamento: finish_reason "length" observado com max_tokens baixo', p4);

  // CA5 · a API não tem memória.
  const p5 = [];
  const m = exp.sem_memoria ?? {};
  const sem = chamada(m.sem_historico);
  const com = chamada(m.com_historico);
  if (!sem || !com || typeof m.fato !== 'string' || !m.fato) {
    p5.push('`sem_memoria` precisa de `fato`, `sem_historico` e `com_historico` apontando chamadas registradas');
  } else {
    const contem = (c) => typeof c.resposta === 'string' && c.resposta.toLowerCase().includes(m.fato.toLowerCase());
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
  const d = exp.decodificacao ?? {};
  const curta = chamada(d.curta);
  const longa = chamada(d.longa);
  if (!curta || !longa) p6.push('`decodificacao.curta` e `.longa` devem apontar chamadas registradas');
  else {
    if (!(longa.completion_tokens > curta.completion_tokens)) p6.push('a chamada longa deve gerar mais tokens de saída que a curta');
    else {
      const esperado = (longa.latencia_ms - curta.latencia_ms) / (longa.completion_tokens - curta.completion_tokens);
      if (!perto(d.ms_por_token_saida, esperado, 0.01, 1e-6)) p6.push(`ms_por_token_saida deveria ser ${esperado.toFixed(2)}`);
      if (esperado <= 0) avisos.push('A chamada longa não demorou mais que a curta (ruído, cache ou fila no servidor). Repita a medição e comente.');
    }
  }
  criterio('CA6', 'Decodificação: mais tokens de saída, ms por token recalculado', p6);

  // CA7 · segredos.
  const p7 = [];
  let texto = textoJson;
  let md = null;
  try {
    md = await readFile(path.join(pasta, 'relatorio.md'), 'utf8');
    texto += '\n' + md;
  } catch { /* tratado no CA8 */ }
  for (const padrao of SEGREDOS) if (padrao.test(texto)) p7.push(`possível segredo no relatório (padrão ${padrao})`);
  criterio('CA7', 'Nenhuma chave ou token nos arquivos entregues', p7);

  // CA8 · relatório do aluno.
  const p8 = [];
  if (md === null) p8.push(`não encontrei ${path.join(pasta, 'relatorio.md')}`);
  else {
    for (const [titulo, min] of [['Resultados', 150], ['Explicação', 400], ['Surpresas e limites', 150]]) {
      const corpo = secao(md, titulo);
      if (corpo === null) p8.push(`falta a seção "## ${titulo}"`);
      else if (corpo.replace(/\s/g, '').length < min) p8.push(`a seção "${titulo}" precisa de pelo menos ${min} caracteres`);
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
  console.log(`\n${ok}/${resultados.length} critérios cumpridos.`);
  return ok === resultados.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error('uso: node verificar.mjs <pasta-da-entrega>   (precisa de relatorio.json e relatorio.md)');
    process.exit(2);
  }
  const res = await verificar(path.resolve(pasta));
  process.exit(imprimir(res, pasta) ? 0 : 1);
}
