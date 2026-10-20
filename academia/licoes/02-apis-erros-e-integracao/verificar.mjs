// Verificador do laboratório da Lição 2. Diferente do da Lição 1 (que confere um relatório), este EXECUTA o seu programa `chamar.*`
// contra um servidor falso que falha de propósito (kit/servidor-falso.mjs) e confere o que o servidor viu e o que o seu programa disse.
// Nenhum LLM é chamado: o servidor fala só em 127.0.0.1. O seu programa roda com um ambiente mínimo (sem as suas chaves de verdade).
//
//   node academia/licoes/02-apis-erros-e-integracao/verificar.mjs academia/alunos/<aluno>/entregas/etapa-02 [--comando "uv run python"] [--so CA5,CA6]
//
// O que ele NÃO prova: que o código está bem escrito, que os tipos de TypeScript estão certos (o Node os apaga sem conferir) nem que há
// jitter no backoff (o sorteio não é verificável com segurança). Isso é a rubrica (R2 e R3). E a sua explicação é a rubrica também.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { acharSegredos, ehPrincipal } from '../../ferramentas/comum.mjs';
import { NOMES_DOS_TIPOS, PADROES, PROMPT, REPETIVEIS } from './kit/contrato.mjs';
import { CENARIOS, iniciarServidor, portaFechada } from './kit/servidor-falso.mjs';

const EXTENSOES = ['ts', 'mjs', 'js', 'py'];
const LIMITE_PADRAO_MS = 20_000;
const CHAVE_DO_PROVEDOR_B = ['sk', 'teste', 'provedor', 'b', '123456'].join('-'); // montada aqui para não parecer uma chave no código-fonte
const MARGEM_MS = 400; // folga para a escala do sistema operacional ao medir as esperas
const ENV_DO_SISTEMA = ['PATH', 'Path', 'SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'LANG', 'LC_ALL'];

const ehObjeto = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const ehInteiro = (n, min = 0) => Number.isInteger(n) && n >= min;
const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

// ---------------------------------------------------------------------------------------------------------------------------------
// Execução do programa do aluno
// ---------------------------------------------------------------------------------------------------------------------------------
const executa = (cmd, args, opcoes = {}) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, maxBuffer: 1_000_000, killSignal: 'SIGKILL', ...opcoes }, (erro, stdout, stderr) => {
    resolve({ erro, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), codigo: erro ? (typeof erro.code === 'number' ? erro.code : null) : 0, tempoEsgotado: Boolean(erro?.killed) });
  });
});

let pythonEncontrado;
async function descobrirPython() {
  if (pythonEncontrado !== undefined) return pythonEncontrado;
  for (const candidato of [['python3'], ['python'], ['py', '-3']]) {
    const r = await executa(candidato[0], [...candidato.slice(1), '--version'], { timeout: 8000 });
    if (r.codigo === 0 && /^Python 3\./.test(`${r.stdout}${r.stderr}`.trim())) {
      pythonEncontrado = { cmd: candidato[0], args: [...candidato.slice(1), '-X', 'utf8'] };
      return pythonEncontrado;
    }
  }
  pythonEncontrado = null;
  return null;
}

async function acharPrograma(pasta) {
  let nomes = [];
  try { nomes = await readdir(pasta); } catch { /* pasta ausente */ }
  const achados = EXTENSOES.map((e) => nomes.find((n) => n === `chamar.${e}`)).filter(Boolean);
  return achados;
}

async function escolherExecutor(arquivo, comando) {
  if (comando) {
    const [cmd, ...args] = comando.trim().split(/\s+/);
    return { executor: { cmd, args } };
  }
  const ext = path.extname(arquivo).slice(1);
  if (ext === 'ts' && !process.features.typescript) return { problema: `este Node (${process.version}) não executa .ts: use o Node 22.18 ou superior (ou 24), ou escreva em .mjs/.py` };
  if (ext === 'py') {
    const py = await descobrirPython();
    return py ? { executor: py } : { problema: 'não encontrei o Python 3 (tentei python3, python e py -3); use --comando "<seu executor>"' };
  }
  return { executor: { cmd: process.execPath, args: [] } };
}

/** Valida a linha JSON que o programa imprimiu. Devolve { resultado, problemas }. */
function lerSaida(stdout, codigo) {
  const problemas = [];
  const linhas = stdout.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length !== 1) return { resultado: null, problemas: [`o stdout deve ter exatamente UMA linha JSON (veio ${linhas.length}); logs vão para o stderr`] };
  let r;
  try { r = JSON.parse(linhas[0]); } catch { return { resultado: null, problemas: ['a linha do stdout não é JSON válido'] }; }
  if (!ehObjeto(r) || typeof r.ok !== 'boolean') return { resultado: null, problemas: ['o JSON deve ser um objeto com o campo booleano `ok`'] };
  if (!ehInteiro(r.tentativas, 1)) problemas.push('`tentativas` deve ser um inteiro >= 1');
  if (r.ok) {
    if (typeof r.texto !== 'string' || !r.texto) problemas.push('em caso de sucesso, `texto` deve ser um texto não vazio');
    if (typeof r.finish_reason !== 'string' || !r.finish_reason) problemas.push('em caso de sucesso, `finish_reason` deve ser um texto');
    const u = r.usage;
    if (!ehObjeto(u) || !['prompt_tokens', 'completion_tokens', 'total_tokens'].every((k) => ehInteiro(u[k]))) problemas.push('em caso de sucesso, `usage` precisa de prompt_tokens, completion_tokens e total_tokens inteiros');
    if (codigo !== 0) problemas.push(`com ok:true o código de saída deve ser 0 (veio ${codigo})`);
  } else {
    const e = r.erro;
    if (!ehObjeto(e)) problemas.push('em caso de falha, `erro` deve ser um objeto');
    else {
      if (!NOMES_DOS_TIPOS.includes(e.tipo)) problemas.push(`\`erro.tipo\` deve ser um de: ${NOMES_DOS_TIPOS.join(', ')} (veio ${JSON.stringify(e.tipo)})`);
      if (typeof e.repetivel !== 'boolean') problemas.push('`erro.repetivel` deve ser booleano');
      if (e.status !== null && !ehInteiro(e.status, 100)) problemas.push('`erro.status` deve ser um número HTTP ou null');
      if (typeof e.mensagem !== 'string' || !e.mensagem) problemas.push('`erro.mensagem` deve ser um texto');
    }
    if (codigo !== 1) problemas.push(`com ok:false o código de saída deve ser 1 (veio ${codigo})`);
  }
  return { resultado: r, problemas };
}

/**
 * Roda UMA vez o programa do aluno contra um servidor falso.
 * @returns {{ resultado: object|null, problemasDeProtocolo: string[], requisicoes: object[], ms: number, saida: string, erroPadrao: string, chave: string }}
 */
async function rodar({ programa, executor, pasta, cenario, env = {}, semServidor = false, limiteMs = LIMITE_PADRAO_MS, prompt = PROMPT }) {
  const c = CENARIOS[cenario];
  const servidor = semServidor ? null : await iniciarServidor({ passos: c.passos, perfil: c.perfil });
  const porta = semServidor ? await portaFechada() : null;
  const chaveGerada = `sk-teste-${crypto.randomBytes(9).toString('hex')}`;
  const ambiente = Object.fromEntries(ENV_DO_SISTEMA.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
  Object.assign(ambiente, {
    OPENAI_BASE_URL: servidor ? servidor.url : `http://127.0.0.1:${porta}/v1`,
    'OPENAI_API_KEY': chaveGerada,
    MODELO_CHAT: 'modelo-teste',
    ...env,
  });
  const chave = ambiente.OPENAI_API_KEY; // a que o programa recebeu (um cenário pode trocá-la)
  const t0 = performance.now();
  try {
    const r = await executa(executor.cmd, [...executor.args, programa, prompt], { cwd: pasta, env: ambiente, timeout: limiteMs });
    const ms = performance.now() - t0;
    const problemasDeProtocolo = [];
    let resultado = null;
    if (r.tempoEsgotado) problemasDeProtocolo.push(`o programa não terminou em ${limiteMs / 1000} s e foi encerrado (algum timeout não está funcionando?)`);
    else if (r.codigo === null) problemasDeProtocolo.push(`não consegui executar o programa: ${String(r.erro?.message ?? r.erro).split('\n')[0].slice(0, 160)}`);
    else {
      const lida = lerSaida(r.stdout, r.codigo);
      resultado = lida.resultado;
      problemasDeProtocolo.push(...lida.problemas);
      if (!resultado && r.codigo === 2) problemasDeProtocolo.push('o programa saiu com código 2 (uso ou configuração): ele deveria aceitar estas variáveis de ambiente (veja kit/contrato.mjs)');
    }
    return { resultado, problemasDeProtocolo, requisicoes: servidor ? servidor.registro : [], ms, saida: r.stdout, erroPadrao: r.stderr, chave };
  } finally {
    await servidor?.fechar();
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Verificação
// ---------------------------------------------------------------------------------------------------------------------------------
const ORDEM = ['CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8', 'CA9'];
const TITULOS = {
  CA1: 'Protocolo: uma linha JSON no stdout, formato certo e código de saída 0, 1 ou 2',
  CA2: 'Requisição e sucesso: POST /chat/completions com chave, modelo, mensagem, teto de saída e temperatura; devolve texto, finish_reason e usage',
  CA3: 'Taxonomia: cada falha recebe o tipo certo (e `repetivel` coerente)',
  CA4: 'Tentativas seletivas: repete só o que se resolve sozinho e para exatamente em MAX_TENTATIVAS',
  CA5: 'Esperas: honra o Retry-After, desiste se ele pedir demais, backoff com teto',
  CA6: 'Timeout por tentativa: estoura, vira `timeout` e não trava (nem mata o que é só lento)',
  CA7: 'Segredos: a chave nunca aparece na saída (nem na mensagem de um 401 que a repete) nem no código',
  CA8: 'Provedor por configuração: o mesmo programa fala com dois provedores diferentes só trocando variáveis de ambiente',
  CA9: 'relatorio.md com Resultados, Explicação e Surpresas e limites preenchidos',
};

/**
 * @param {string} pasta pasta da entrega (com chamar.* e relatorio.md)
 * @param {{ comando?: string, limiteMs?: number, so?: string[] }} [opcoes]
 *   `so`: confere só estes critérios (por exemplo ['CA5']); o CA1 (protocolo) vale para as execuções que foram feitas. Útil para iterar rápido.
 */
export async function verificar(pasta, { comando, limiteMs = LIMITE_PADRAO_MS, so } = {}) {
  const selecionados = so?.length ? new Set(so.map((x) => String(x).toUpperCase())) : null;
  for (const id of selecionados ?? []) if (!ORDEM.includes(id)) throw new Error(`critério desconhecido: ${id} (use ${ORDEM.join(', ')})`);
  const incluir = (id) => !selecionados || selecionados.has(id) || id === 'CA1';
  const resultados = [];
  const avisos = [];
  const criterio = (id, titulo, problemas) => { if (incluir(id)) resultados.push({ id, titulo, ok: problemas.length === 0, problemas }); };
  const finalizar = () => ({ resultados: resultados.sort((a, b) => ORDEM.indexOf(a.id) - ORDEM.indexOf(b.id)), avisos });
  const naoAvaliado = (motivo) => { for (const id of ORDEM.slice(1, 8)) criterio(id, TITULOS[id], [motivo]); };

  // --- localizar o programa ---
  const achados = await acharPrograma(pasta);
  if (!achados.length) {
    criterio('CA1', TITULOS.CA1, [`não encontrei chamar.ts, chamar.mjs, chamar.js nem chamar.py em ${pasta}`]);
    naoAvaliado('não avaliado: falta o programa chamar.*');
    return finalizar();
  }
  if (achados.length > 1 && !comando) avisos.push(`há mais de um programa (${achados.join(', ')}); verifiquei ${achados[0]}. Apague os outros ou use --comando`);
  const arquivo = achados[0];
  const programa = path.join(pasta, arquivo);
  const { executor, problema } = await escolherExecutor(arquivo, comando);
  if (!executor) {
    criterio('CA1', TITULOS.CA1, [problema]);
    naoAvaliado('não avaliado: não consegui escolher como executar o programa');
    return finalizar();
  }
  const fonte = await readFile(programa, 'utf8').catch(() => '');
  const roda = (cenario, env, extra = {}) => rodar({ programa, executor, pasta, cenario, env, limiteMs, ...extra });

  // --- porta de entrada: se nem o caso mais simples cumpre o protocolo, parar aqui (cada execução quebrada custaria até o limite de tempo) ---
  const R = {};
  R.sucesso = await roda('sucesso', {});
  if (!R.sucesso.resultado || R.sucesso.problemasDeProtocolo.length) {
    criterio('CA1', TITULOS.CA1, R.sucesso.problemasDeProtocolo.map((p) => `cenário sucesso: ${p}`));
    naoAvaliado('não avaliado: corrija primeiro o CA1 (rodei só o cenário "sucesso")');
    return finalizar();
  }

  // --- demais execuções: feitas sob demanda, em sequência (as medidas de tempo não podem competir entre si) ---
  const rapido = { BACKOFF_BASE_MS: '20', BACKOFF_TETO_MS: '100' };
  const simples = (cenario) => () => roda(cenario, { ...rapido, MAX_TENTATIVAS: '3' });
  const DEF = {
    'chave-invalida': simples('chave-invalida'),
    'requisicao-invalida': simples('requisicao-invalida'),
    'cota-esgotada': simples('cota-esgotada'),
    'truncado': simples('truncado'),
    'html-no-lugar-de-json': simples('html-no-lugar-de-json'),
    'json-sem-choices': simples('json-sem-choices'),
    sempre503x3: () => roda('sempre-503', { ...rapido, MAX_TENTATIVAS: '3' }),
    sempre503x1: () => roda('sempre-503', { ...rapido, MAX_TENTATIVAS: '1' }),
    sempre429: () => roda('sempre-429', { ...rapido, MAX_TENTATIVAS: '2' }),
    derruba: () => roda('derruba-conexao', { ...rapido, MAX_TENTATIVAS: '3' }),
    recusada: () => roda('sucesso', { ...rapido, MAX_TENTATIVAS: '3' }, { semServidor: true }),
    instavel: async () => {
      const lista = [];
      for (let i = 0; i < 6; i++) lista.push(await roda('servidor-instavel', { BACKOFF_BASE_MS: '150', BACKOFF_TETO_MS: '600', MAX_TENTATIVAS: '3' }));
      return lista;
    },
    teto: () => roda('sempre-503', { BACKOFF_BASE_MS: '200', BACKOFF_TETO_MS: '100', MAX_TENTATIVAS: '5' }),
    retryAfter: () => roda('limite-de-taxa', { BACKOFF_BASE_MS: '20', BACKOFF_TETO_MS: '100', MAX_TENTATIVAS: '3' }),
    retryAfterGigante: () => roda('retry-after-gigante', { ...rapido, MAX_TENTATIVAS: '3', ESPERA_MAX_MS: '1500' }),
    lento: () => roda('lento', { ...rapido, TIMEOUT_MS: '300', MAX_TENTATIVAS: '2' }),
    devagar: () => roda('devagar', { ...rapido, TIMEOUT_MS: '1500' }),
    provedorB: () => roda('provedor-b', { 'PARAM_MAX_TOKENS': 'max_completion_tokens', TEMPERATURA: 'omitir', MODELO_CHAT: 'modelo-b', MAX_TOKENS: '8', 'OPENAI_API_KEY': CHAVE_DO_PROVEDOR_B }),
    config: () => roda('sucesso', { TEMPERATURA: '0.5', MAX_TOKENS: '17', MODELO_CHAT: 'modelo-c' }),
    data: () => roda('retry-after-data', { ...rapido, MAX_TENTATIVAS: '2' }),
    gotejo: () => roda('gotejamento', { ...rapido, TIMEOUT_MS: '400', MAX_TENTATIVAS: '1' }),
  };
  const requer = async (...nomes) => { for (const n of nomes) R[n] ??= await DEF[n](); };

  const dif = (r, i = 1) => r.requisicoes[i]?.t - r.requisicoes[i - 1]?.t; // ms entre dois pedidos que o servidor viu
  const res = (r) => r.resultado ?? { ok: undefined, tentativas: undefined, erro: undefined, texto: undefined }; // execução sem JSON válido: o CA1 já reprovou
  const rotulo = { 'chave-invalida': '401', 'requisicao-invalida': '400', 'cota-esgotada': '429 de cota', truncado: 'finish_reason length', 'html-no-lugar-de-json': '200 com HTML', 'json-sem-choices': '200 sem choices' };

  // CA2 · requisição e sucesso.
  if (incluir('CA2')) {
    const p2 = [];
    const s = res(R.sucesso);
    if (s.ok !== true) p2.push(`no cenário sucesso o resultado deveria ser ok:true (veio ok:false, tipo ${s.erro?.tipo}: ${String(s.erro?.mensagem).slice(0, 100)})`);
    else {
      if (s.texto !== 'Olá') p2.push(`texto deveria ser "Olá" (o que o servidor devolveu), veio ${JSON.stringify(s.texto)}`);
      if (s.finish_reason !== 'stop') p2.push(`finish_reason deveria ser "stop", veio ${JSON.stringify(s.finish_reason)}`);
      if (!iguais(s.usage, { prompt_tokens: 14, completion_tokens: 2, total_tokens: 16 })) p2.push(`usage deveria ser o do servidor {14, 2, 16}, veio ${JSON.stringify(s.usage)}`);
      if (s.tentativas !== 1) p2.push(`tentativas deveria ser 1, veio ${s.tentativas}`);
    }
    const q = R.sucesso.requisicoes[0];
    if (R.sucesso.requisicoes.length !== 1) p2.push(`o servidor deveria ver 1 pedido, viu ${R.sucesso.requisicoes.length}`);
    if (q) {
      if (q.metodo !== 'POST') p2.push(`o método deveria ser POST, foi ${q.metodo}`);
      if (q.caminho !== '/v1/chat/completions') p2.push(`o caminho deveria ser /v1/chat/completions (OPENAI_BASE_URL + /chat/completions), foi ${q.caminho}`);
      if (q.cabecalhos.authorization !== `Bearer ${R.sucesso.chave}`) p2.push('o cabeçalho Authorization deveria ser "Bearer <OPENAI_API_KEY>"');
      if (!String(q.cabecalhos['content-type'] ?? '').includes('application/json')) p2.push('o Content-Type deveria ser application/json');
      const c = q.corpo ?? {};
      if (c.model !== 'modelo-teste') p2.push(`o campo model deveria ser MODELO_CHAT ("modelo-teste"), foi ${JSON.stringify(c.model)}`);
      if (!iguais(c.messages, [{ role: 'user', content: PROMPT }])) p2.push('messages deveria ser exatamente [{"role":"user","content":<o prompt recebido>}]');
      if (c.max_tokens !== Number(PADROES.MAX_TOKENS)) p2.push(`sem MAX_TOKENS definido, max_tokens deveria ser ${PADROES.MAX_TOKENS}, foi ${JSON.stringify(c.max_tokens)}`);
      if (c.temperature !== 0) p2.push(`sem TEMPERATURA definida, temperature deveria ser 0, foi ${JSON.stringify(c.temperature)}`);
      if (c.stream === true) p2.push('não peça streaming: o programa devolve a resposta inteira');
    }
    criterio('CA2', TITULOS.CA2, p2);
  }

  // CA3 · taxonomia.
  if (incluir('CA3')) {
    await requer('chave-invalida', 'requisicao-invalida', 'cota-esgotada', 'truncado', 'html-no-lugar-de-json', 'json-sem-choices', 'sempre503x3', 'sempre429', 'lento', 'derruba', 'recusada');
    const p3 = [];
    const taxonomia = [
      ['chave-invalida', R['chave-invalida'], 'autenticacao', 401], ['requisicao-invalida', R['requisicao-invalida'], 'requisicao_invalida', 400],
      ['cota-esgotada', R['cota-esgotada'], 'cota_esgotada', 429], ['truncado', R.truncado, 'truncado', 200], ['html-no-lugar-de-json', R['html-no-lugar-de-json'], 'resposta_invalida', 200],
      ['json-sem-choices', R['json-sem-choices'], 'resposta_invalida', 200], ['sempre-503', R.sempre503x3, 'servidor', 503], ['sempre-429', R.sempre429, 'limite_de_taxa', 429],
      ['lento', R.lento, 'timeout', null], ['derruba-conexao', R.derruba, 'rede', null], ['porta fechada', R.recusada, 'rede', null],
    ];
    for (const [nome, r, tipo, status] of taxonomia) {
      if (!r.resultado) continue;
      const x = r.resultado;
      if (x.ok !== false) { p3.push(`${nome}: deveria falhar (ok:false), mas veio ok:true`); continue; }
      if (x.erro.tipo !== tipo) p3.push(`${nome}: o tipo deveria ser "${tipo}", veio "${x.erro.tipo}"`);
      if (typeof x.erro.repetivel === 'boolean' && x.erro.repetivel !== REPETIVEIS.includes(x.erro.tipo)) p3.push(`${nome}: \`repetivel\` é ${x.erro.repetivel}, mas o tipo "${x.erro.tipo}" ${REPETIVEIS.includes(x.erro.tipo) ? 'é' : 'não é'} repetível`);
      const statusOk = status === null ? x.erro.status === null : status === 200 ? [200, null].includes(x.erro.status) : x.erro.status === status;
      if (!statusOk) p3.push(`${nome}: \`status\` deveria ser ${status === 200 ? '200 (ou null)' : status}, veio ${JSON.stringify(x.erro.status)}`);
    }
    criterio('CA3', TITULOS.CA3, [...new Set(p3)]);
  }

  // CA4 · tentativas seletivas e contagem exata.
  if (incluir('CA4')) {
    await requer(...Object.keys(rotulo), 'sempre503x3', 'sempre503x1', 'sempre429', 'derruba', 'recusada', 'instavel');
    const p4 = [];
    for (const nome of Object.keys(rotulo)) {
      const r = R[nome];
      if (!r.resultado) continue;
      if (r.requisicoes.length !== 1) p4.push(`${rotulo[nome]}: não adianta tentar de novo, mas o servidor viu ${r.requisicoes.length} pedidos (deveria ser 1)`);
      if (res(r).tentativas !== 1) p4.push(`${rotulo[nome]}: \`tentativas\` deveria ser 1, veio ${res(r).tentativas}`);
    }
    const contagem = (nome, r, esperado) => {
      if (r.requisicoes.length !== esperado) p4.push(`${nome}: o servidor deveria ver exatamente ${esperado} pedidos, viu ${r.requisicoes.length}`);
      if (res(r).tentativas !== esperado) p4.push(`${nome}: \`tentativas\` deveria ser ${esperado}, veio ${res(r).tentativas}`);
    };
    contagem('503 para sempre com MAX_TENTATIVAS=3', R.sempre503x3, 3);
    contagem('503 para sempre com MAX_TENTATIVAS=1 (nenhuma repetição)', R.sempre503x1, 1);
    contagem('429 de taxa para sempre com MAX_TENTATIVAS=2', R.sempre429, 2);
    contagem('conexão derrubada com MAX_TENTATIVAS=3', R.derruba, 3);
    if (res(R.recusada).tentativas !== 3) p4.push(`porta fechada com MAX_TENTATIVAS=3: \`tentativas\` deveria ser 3, veio ${res(R.recusada).tentativas}`);
    R.instavel.forEach((r, i) => {
      if (!r.resultado) return;
      const x = r.resultado;
      if (x.ok !== true || x.texto !== 'Olá') p4.push(`500, 503 e depois 200 (execução ${i + 1}): deveria terminar com sucesso na 3ª tentativa, veio ${x.ok ? 'texto errado' : `erro ${x.erro?.tipo}`}`);
      else contagem(`500, 503 e depois 200 (execução ${i + 1})`, r, 3);
    });
    criterio('CA4', TITULOS.CA4, [...new Set(p4)]);
  }

  // CA5 · esperas.
  if (incluir('CA5')) {
    await requer('retryAfter', 'retryAfterGigante', 'instavel', 'teto');
    const p5 = [];
    const ra = res(R.retryAfter);
    if (ra.ok !== true || ra.tentativas !== 2 || R.retryAfter.requisicoes.length !== 2) p5.push(`429 com Retry-After: 1 e depois 200: deveria terminar com sucesso na 2ª tentativa (ok=${ra.ok}, tentativas=${ra.tentativas}, pedidos=${R.retryAfter.requisicoes.length})`);
    else if (dif(R.retryAfter) < 900) p5.push(`Retry-After: 1 pede 1 s de espera, mas o 2º pedido veio ${Math.round(dif(R.retryAfter))} ms depois do 1º (BACKOFF_BASE_MS era 20): honre o cabeçalho`);
    const rg = res(R.retryAfterGigante);
    if (R.retryAfterGigante.requisicoes.length !== 1 || rg.ok !== false || rg.erro?.tipo !== 'limite_de_taxa') p5.push(`Retry-After: 3600 com ESPERA_MAX_MS=1500: deveria desistir na hora com tipo limite_de_taxa e 1 pedido (pedidos=${R.retryAfterGigante.requisicoes.length}, ok=${rg.ok}, tipo=${rg.erro?.tipo})`);
    else if (R.retryAfterGigante.ms > 4000) p5.push(`Retry-After: 3600 com ESPERA_MAX_MS=1500: demorou ${Math.round(R.retryAfterGigante.ms)} ms; deveria desistir sem esperar`);
    let esperasVisiveis = 0; // quantas esperas passaram de 60 ms (com sorteio de 0 a 150 e a 300 ms, quase todas passam; sem espera nenhuma passa)
    R.instavel.forEach((r, i) => {
      if (r.requisicoes.length !== 3) return;
      const g1 = dif(r, 1);
      const g2 = dif(r, 2);
      esperasVisiveis += (g1 >= 60) + (g2 >= 60);
      if (g1 > 150 + MARGEM_MS) p5.push(`backoff (execução ${i + 1}): a espera antes da 2ª tentativa foi de ${Math.round(g1)} ms, acima de BACKOFF_BASE_MS (150) + margem`);
      if (g2 > 300 + MARGEM_MS) p5.push(`backoff (execução ${i + 1}): a espera antes da 3ª tentativa foi de ${Math.round(g2)} ms, acima de 2 × BACKOFF_BASE_MS (300) + margem`);
    });
    if (R.instavel.every((r) => r.requisicoes.length === 3) && esperasVisiveis < 2) p5.push(`backoff: em 12 esperas entre tentativas só ${esperasVisiveis} passaram de 60 ms: parece que não há espera entre as tentativas`);
    const gapsDoTeto = R.teto.requisicoes.slice(1).map((_, i) => dif(R.teto, i + 1));
    if (gapsDoTeto.length === 4 && gapsDoTeto.some((g) => g > 100 + MARGEM_MS)) p5.push(`BACKOFF_TETO_MS=100 não foi respeitado: esperas de ${gapsDoTeto.map((g) => Math.round(g)).join(', ')} ms (o teto vale para o backoff, não para o Retry-After)`);
    criterio('CA5', TITULOS.CA5, [...new Set(p5)]);
  }

  // CA6 · timeout.
  if (incluir('CA6')) {
    await requer('lento', 'devagar');
    const p6 = [];
    const l = res(R.lento);
    if (l.ok !== false || l.erro?.tipo !== 'timeout') p6.push(`servidor que demora 3 s com TIMEOUT_MS=300: deveria dar erro "timeout" (ok=${l.ok}, tipo=${l.erro?.tipo})`);
    if (R.lento.requisicoes.length !== 2 || l.tentativas !== 2) p6.push(`timeout é repetível: com MAX_TENTATIVAS=2 deveria haver 2 pedidos e tentativas=2 (pedidos=${R.lento.requisicoes.length}, tentativas=${l.tentativas})`);
    if (R.lento.ms < 450) p6.push(`desistiu em ${Math.round(R.lento.ms)} ms: duas tentativas de 300 ms levam pelo menos 600 ms (o timeout está curto demais?)`);
    if (R.lento.ms > 2600) p6.push(`levou ${Math.round(R.lento.ms)} ms: o timeout deve valer por TENTATIVA (2 × 300 ms), não esperar a resposta de 3 s`);
    const d = res(R.devagar);
    if (d.ok !== true || d.tentativas !== 1) p6.push(`servidor que demora 150 ms com TIMEOUT_MS=1500: deveria dar sucesso na 1ª tentativa (ok=${d.ok}, tentativas=${d.tentativas})`);
    criterio('CA6', TITULOS.CA6, [...new Set(p6)]);
  }

  // CA8 · provedor por configuração.
  if (incluir('CA8')) {
    await requer('provedorB', 'config');
    const p8 = [];
    const b = res(R.provedorB);
    const qb = R.provedorB.requisicoes[0];
    if (b.ok !== true) p8.push(`provedor B (exige max_completion_tokens, recusa max_tokens e temperature): deveria dar sucesso só trocando as variáveis de ambiente (PARAM_MAX_TOKENS para max_completion_tokens e TEMPERATURA para omitir) (veio ok:false, tipo ${b.erro?.tipo}: ${String(b.erro?.mensagem).slice(0, 110)})`);
    if (qb) {
      const c = qb.corpo ?? {};
      if (c.max_completion_tokens !== 8) p8.push(`provedor B: max_completion_tokens deveria ser 8 (MAX_TOKENS), foi ${JSON.stringify(c.max_completion_tokens)}`);
      if ('max_tokens' in c) p8.push('provedor B: não envie max_tokens quando PARAM_MAX_TOKENS é outro nome');
      if ('temperature' in c) p8.push('provedor B: TEMPERATURA igual a omitir significa não enviar o campo temperature');
      if (c.model !== 'modelo-b') p8.push(`provedor B: model deveria ser MODELO_CHAT ("modelo-b"), foi ${JSON.stringify(c.model)}`);
      if (qb.cabecalhos.authorization !== `Bearer ${CHAVE_DO_PROVEDOR_B}`) p8.push('provedor B: a chave deveria vir de OPENAI_API_KEY');
    }
    const qc = R.config.requisicoes[0]?.corpo ?? {};
    if (qc.temperature !== 0.5 || qc.max_tokens !== 17 || qc.model !== 'modelo-c') p8.push(`com TEMPERATURA 0.5, MAX_TOKENS 17 e MODELO_CHAT modelo-c, o corpo deveria ter temperature 0.5, max_tokens 17 e model "modelo-c" (veio ${JSON.stringify({ temperature: qc.temperature, max_tokens: qc.max_tokens, model: qc.model })})`);
    criterio('CA8', TITULOS.CA8, [...new Set(p8)]);
  }

  // CA9 · relatório do aluno.
  if (incluir('CA9')) {
    const p9 = [];
    const md = await readFile(path.join(pasta, 'relatorio.md'), 'utf8').catch(() => null);
    if (md === null) p9.push(`não encontrei ${path.join(pasta, 'relatorio.md')}`);
    else {
      for (const [titulo, min] of [['Resultados', 120], ['Explicação', 320], ['Surpresas e limites', 120]]) {
        const corpo = secao(md, titulo);
        if (corpo === null) p9.push(`falta a seção "## ${titulo}"`);
        else if (conteudoUtil(corpo) < min) p9.push(`a seção "${titulo}" precisa de pelo menos ${min} letras ou números escritos por você (os comentários do modelo não contam)`);
      }
      for (const s9 of acharSegredos(md.replace(/\r\n?/g, '\n'))) p9.push(`relatorio.md:${s9.linha}: possível segredo (${s9.nome}); remova e troque a credencial`);
    }
    criterio('CA9', TITULOS.CA9, p9);
  }

  // CA7 e CA1 por último: valem para TODAS as execuções feitas (numa verificação completa, as de todos os cenários).
  if (!selecionados) await requer(...Object.keys(DEF));
  if (incluir('CA7')) {
    await requer('chave-invalida');
    const p7 = [];
    for (const [nome, r] of executadas(R)) {
      if (r.saida.includes(r.chave)) p7.push(`cenário ${nome}: a chave apareceu no stdout`);
      if (r.erroPadrao.includes(r.chave)) p7.push(`cenário ${nome}: a chave apareceu no stderr`);
    }
    if (!res(R['chave-invalida']).ok && !String(res(R['chave-invalida']).erro?.mensagem ?? '').length) p7.push('chave-invalida: a mensagem de erro veio vazia');
    for (const s7 of acharSegredos(fonte.replace(/\r\n?/g, '\n'))) p7.push(`${arquivo}:${s7.linha}: possível segredo no código (${s7.nome}); a chave vem de OPENAI_API_KEY`);
    criterio('CA7', TITULOS.CA7, [...new Set(p7)]);
  }
  const p1 = [];
  for (const [nome, r] of executadas(R)) for (const p of r.problemasDeProtocolo) p1.push(`cenário ${nome}: ${p}`);
  criterio('CA1', TITULOS.CA1, p1);

  // --- avisos (não reprovam; só numa verificação completa) ---
  if (!selecionados) {
    const da = res(R.data);
    if (da.ok === true && R.data.requisicoes.length === 2 && dif(R.data) < 800) {
      avisos.push(`Retry-After em formato de data (RFC 9110): o 2º pedido veio ${Math.round(dif(R.data))} ms depois; o cabeçalho pedia cerca de 2 s. Seu programa só entende o formato em segundos.`);
    }
    if (R.gotejo.ms > 3000) {
      avisos.push(`Servidor que envia o corpo em conta-gotas por 4 s com TIMEOUT_MS=400: o seu programa esperou ${Math.round(R.gotejo.ms)} ms. O timeout parece valer só por inatividade; o de uma tentativa deve valer para a tentativa INTEIRA (veja a seção 4.3).`);
    }
  }
  return finalizar();
}

/** Todas as execuções já feitas, com um nome para as mensagens (a lista `instavel` vira instavel#1..4). */
const executadas = (R) => Object.entries(R).flatMap(([nome, v]) => (Array.isArray(v) ? v.map((x, i) => [`${nome}#${i + 1}`, x]) : [[nome, v]]));

function imprimir({ resultados, avisos }, pasta) {
  console.log(`Lição 2 · verificação de ${pasta}\n`);
  for (const c of resultados) {
    console.log(`${c.ok ? '[ok]    ' : '[falhou]'} ${c.id} · ${c.titulo}`);
    for (const p of c.problemas.slice(0, 12)) console.log(`           - ${p}`);
    if (c.problemas.length > 12) console.log(`           ... e mais ${c.problemas.length - 12}`);
  }
  if (avisos.length) {
    console.log('\nAvisos (não reprovam):');
    for (const a of avisos) console.log(`  - ${a}`);
  }
  const ok = resultados.filter((c) => c.ok).length;
  console.log(`\n${ok}/${resultados.length} critérios cumpridos. (Isto prova comportamento diante de falhas simuladas, não que o código seja bom: veja o início deste arquivo.)`);
  return ok === resultados.length;
}

if (ehPrincipal(import.meta.url)) {
  const args = process.argv.slice(2);
  const opcoes = {};
  const posicionais = [];
  for (let i = 0; i < args.length; i++) {
    if (['--comando', '--so'].includes(args[i])) { opcoes[args[i].slice(2)] = args[i + 1]; i++; } else posicionais.push(args[i]);
  }
  const uso = 'uso: node verificar.mjs <pasta-da-entrega> [--comando "<executor>"] [--so CA5,CA6]   (precisa de chamar.ts|mjs|js|py e relatorio.md)';
  if (posicionais.length !== 1 || ('comando' in opcoes && !opcoes.comando) || ('so' in opcoes && !opcoes.so) || args.some((a) => a.startsWith('--') && !['--comando', '--so'].includes(a))) {
    console.error(uso);
    process.exit(2);
  }
  let resultado;
  try {
    resultado = await verificar(path.resolve(posicionais[0]), { comando: opcoes.comando, so: opcoes.so?.split(',') });
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  process.exit(imprimir(resultado, posicionais[0]) ? 0 : 1);
}
