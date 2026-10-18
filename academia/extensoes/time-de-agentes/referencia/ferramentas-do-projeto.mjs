// Ferramentas de projeto para o time de agentes: ler arquivos, listar, ver o `git diff` e rodar os testes.
// Sem dependências (Node 22+). Para plugar no registro de ferramentas (harness-de-agentes/referencia).
//
// Por que existem: um agente sem ferramentas só consegue ESCREVER que rodou os testes. Aqui a saída vem do harness (é capturada
// por ele e entregue ao avaliador como evidência), então "cole a saída dos testes" deixa de ser teatro.
//
// Controles:
//   - tudo fica DENTRO de `raiz` (caminhos relativos, sem `..`, sem escapar por symlink/junction);
//   - arquivos que costumam guardar segredos nunca são lidos (.env*, chaves privadas, .git, node_modules);
//   - toda saída passa por máscara de segredos e por limite de tamanho;
//   - `git diff` só aceita uma referência simples (sem opções) e roda sem shell;
//   - `rodar_testes` executa APENAS o comando configurado pelo dono (o modelo não escolhe o comando), com ambiente reduzido
//     (sem chaves de API), timeout e risco "escrita" (precisa ser liberado em `permissoes`). O comando executa o código do projeto:
//     use um projeto seu ou um contêiner/sandbox.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { mascararSegredos } from '../../../ferramentas/comum.mjs';

// Todos sem diferenciar maiúsculas: no Windows e no macOS `.GIT`, `Node_Modules` e `.ENV` são os mesmos arquivos.
const NEGADOS = [
  /(^|\/)\.git(\/|$)/i, /(^|\/)node_modules(\/|$)/i, /(^|\/)\.env(\.|$)/i, /(^|\/)\.(npmrc|netrc|pypirc)$/i, /\.(pem|key|p12|pfx|jks|kdbx)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i, /(^|\/)(credentials|secrets?)(\.[a-z]+)?$/i,
];
const LIMITE_BYTES = 2_000_000;

/** Troca no diff os blocos de arquivos sensíveis (`git diff` mostraria o conteúdo de um .env versionado). */
function filtrarDiff(diff) {
  const blocos = diff.split(/^(?=diff --git )/m);
  return blocos.map((bloco) => {
    const cabecalho = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/m.exec(bloco);
    if (!cabecalho || !(NEGADOS.some((re) => re.test(cabecalho[1])) || NEGADOS.some((re) => re.test(cabecalho[2])))) return bloco;
    return `diff --git a/${cabecalho[2]} b/${cabecalho[2]}\n[conteúdo omitido: arquivo sensível ou fora do escopo]\n`;
  }).join('');
}
const REF_GIT = /^[A-Za-z0-9_][A-Za-z0-9._/~^@{}-]{0,99}$/;
const ENV_BASE = ['PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR', 'SystemRoot', 'LANG', 'LC_ALL'];

export function criarFerramentasDoProjeto({ raiz, comandoTestes, limiteArquivo = 20_000, timeoutMs = 60_000, envPermitidas = [], listaMax = 200 } = {}) {
  if (!raiz || !fs.existsSync(raiz)) throw new Error('raiz do projeto inexistente');
  const base = fs.realpathSync(raiz);
  if (comandoTestes !== undefined && (!Array.isArray(comandoTestes) || !comandoTestes.length || comandoTestes.some((c) => typeof c !== 'string'))) {
    throw new Error('comandoTestes deve ser uma lista [executavel, ...argumentos]');
  }

  /** Caminho relativo e seguro dentro da raiz (ou lança). */
  function resolver(rel) {
    if (typeof rel !== 'string' || !rel || rel.includes('\0') || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) throw new Error('caminho inválido: use um caminho relativo à raiz do projeto');
    const norm = rel.replace(/\\/g, '/');
    if (norm.split('/').includes('..')) throw new Error('caminho inválido: não é permitido subir pastas');
    if (NEGADOS.some((re) => re.test(norm))) throw new Error('acesso negado: arquivo sensível ou fora do escopo (.git, node_modules, .env*, chaves)');
    const abs = path.resolve(base, norm);
    let real;
    try { real = fs.realpathSync(abs); } catch { throw new Error('arquivo ou pasta não encontrado'); }
    const relReal = path.relative(base, real);
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) throw new Error('acesso negado: o caminho aponta para fora do projeto');
    if (NEGADOS.some((re) => re.test(relReal.split(path.sep).join('/')))) throw new Error('acesso negado: arquivo sensível ou fora do escopo');
    return { abs: real, rel: relReal.split(path.sep).join('/') || '.' };
  }

  const executar = (cmd, args, opcoes = {}) => new Promise((ok) => {
    execFile(cmd, args, { cwd: base, timeout: opcoes.timeout ?? timeoutMs, maxBuffer: 2_000_000, windowsHide: true, env: opcoes.env ?? process.env }, (erro, stdout, stderr) => {
      ok({ codigo: erro ? (typeof erro.code === 'number' ? erro.code : -1) : 0, estourouTempo: Boolean(erro?.killed), stdout, stderr });
    });
  });

  const esquema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

  const ler_arquivo = {
    nome: 'ler_arquivo',
    descricao: 'Lê um arquivo de texto do projeto (somente leitura), com números de linha, para citar arquivo:linha. Caminho relativo à raiz do projeto.',
    risco: 'leitura',
    esquema: esquema({
      caminho: { type: 'string', minLength: 1, maxLength: 300 },
      inicio: { type: 'integer', minimum: 1 },
      fim: { type: 'integer', minimum: 1 },
    }, ['caminho']),
    async executar({ caminho, inicio = 1, fim }) {
      const { abs, rel } = resolver(caminho);
      const st = fs.statSync(abs);
      if (!st.isFile()) throw new Error('não é um arquivo');
      if (st.size > LIMITE_BYTES) throw new Error(`arquivo grande demais (${st.size} bytes; o máximo é ${LIMITE_BYTES}): leia um trecho com outra ferramenta`);
      const bruto = fs.readFileSync(abs);
      if (bruto.includes(0)) throw new Error('arquivo binário: não leio');
      const linhas = bruto.toString('utf8').replace(/\r\n?/g, '\n').split('\n');
      const ate = Math.min(fim ?? linhas.length, linhas.length);
      if (inicio > ate) throw new Error('intervalo de linhas vazio');
      let texto = linhas.slice(inicio - 1, ate).map((l, i) => `L${inicio + i}: ${l}`).join('\n');
      const truncado = texto.length > limiteArquivo;
      if (truncado) texto = texto.slice(0, limiteArquivo);
      return { arquivo: rel, linhas: `${inicio}-${ate} de ${linhas.length}`, truncado, conteudo: mascararSegredos(texto) };
    },
  };

  const listar_arquivos = {
    nome: 'listar_arquivos',
    descricao: 'Lista arquivos e pastas do projeto (somente leitura), sem .git, node_modules nem arquivos sensíveis. Caminho relativo à raiz; "." é a raiz.',
    risco: 'leitura',
    esquema: esquema({ pasta: { type: 'string', maxLength: 300 }, profundidade: { type: 'integer', minimum: 1, maximum: 4 } }),
    async executar({ pasta = '.', profundidade = 2 }) {
      const ini = pasta === '.' ? { abs: base, rel: '.' } : resolver(pasta);
      if (!fs.statSync(ini.abs).isDirectory()) throw new Error('não é uma pasta');
      const saida = [];
      let cortado = false;
      (function andar(dir, nivel) {
        for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
          const abs = path.join(dir, d.name);
          const rel = path.relative(base, abs).split(path.sep).join('/');
          if (NEGADOS.some((re) => re.test(rel))) continue;
          if (saida.length >= listaMax) { cortado = true; return; }
          saida.push(d.isDirectory() ? `${rel}/` : rel);
          if (d.isDirectory() && nivel < profundidade && !d.isSymbolicLink()) andar(abs, nivel + 1);
        }
      }(ini.abs, 1));
      return { pasta: ini.rel, itens: saida, cortado };
    },
  };

  const git_diff = {
    nome: 'git_diff',
    descricao: 'Mostra o `git diff` do projeto (somente leitura): mudanças não commitadas, ou contra uma referência (ex.: main, HEAD~1). Use para revisar uma mudança.',
    risco: 'leitura',
    esquema: esquema({ referencia: { type: 'string', maxLength: 100 }, apenas_staged: { type: 'boolean' } }),
    async executar({ referencia, apenas_staged = false }) {
      if (referencia !== undefined && !REF_GIT.test(referencia)) throw new Error('referência inválida: use um nome de branch, tag ou commit simples');
      // Um repositório de terceiros pode configurar comandos que o próprio `git diff` executaria (textconv, diff externo, fsmonitor): desligados aqui.
      const args = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', 'diff', '--no-color', '--no-ext-diff', '--no-textconv', ...(apenas_staged ? ['--cached'] : []), ...(referencia ? [referencia] : []), '--'];
      const r = await executar('git', args);
      if (r.codigo !== 0) throw new Error(`git diff falhou (código ${r.codigo}): ${mascararSegredos(r.stderr).slice(0, 300)}`);
      const diff = mascararSegredos(filtrarDiff(r.stdout)).slice(0, limiteArquivo * 3);
      return { vazio: !r.stdout.trim(), diff, truncado: r.stdout.length > limiteArquivo * 3 };
    },
  };

  const ferramentas = [ler_arquivo, listar_arquivos, git_diff];

  if (comandoTestes) {
    ferramentas.push({
      nome: 'rodar_testes',
      descricao: `Roda o comando de testes configurado pelo dono (${comandoTestes.join(' ')}) e devolve o código de saída e o final da saída. Executa o código do projeto.`,
      risco: 'escrita',
      esquema: esquema({}),
      async executar() {
        const env = {};
        for (const k of [...ENV_BASE, ...envPermitidas]) if (process.env[k] !== undefined) env[k] = process.env[k];
        env.CI = '1';
        const [cmd, ...args] = comandoTestes;
        const r = await executar(cmd, args, { env, timeout: timeoutMs * 2 });
        const saida = mascararSegredos(`${r.stdout}\n${r.stderr}`.trim());
        return { comando: comandoTestes.join(' '), codigo: r.codigo, passou: r.codigo === 0, estourouTempo: r.estourouTempo, saida_final: saida.slice(-8000) };
      },
    });
  }
  return ferramentas;
}
