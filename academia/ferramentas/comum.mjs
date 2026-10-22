// Utilitários compartilhados pelas ferramentas e pelos verificadores da Academia (sem dependências).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Verdadeiro se o módulo em `importMetaUrl` é o programa que o Node está executando. Compara os caminhos reais:
 * `import.meta.url` já vem resolvido, mas `process.argv[1]` não (symlinks e junctions fariam o script sair sem fazer nada).
 */
export function ehPrincipal(importMetaUrl) {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Segredos. MELHOR ESFORÇO: reconhece formatos conhecidos e algumas formas em prosa. Não prova ausência de segredo.
// Limites conhecidos: senhas em prosa sem palavra-chave por perto, segredos codificados/divididos, formatos novos de provedores.
// Todas as expressões usam quantificadores limitados para não degradarem (tempo quadrático) em textos longos.
// ---------------------------------------------------------------------------------------------------------------------
const PALAVRA_SENHA = '(?:senha|password|passwd|pwd|segredo|secret)';

/** Valor "parece senha": 6+ caracteres e pelo menos um dígito ou símbolo (descarta palavras comuns como "obrigatória"). */
const pareceSenha = (valor) => valor.length >= 6 && valor.length <= 128 && /[0-9!@#$%^&*+=]/.test(valor) && !/^https?:/i.test(valor);

export const SEGREDOS = [
  { nome: 'chave sk-', re: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,200}/ },
  { nome: 'chave do Stripe', re: /(?<![A-Za-z0-9])[spr]k_(?:live|test)_[A-Za-z0-9]{10,200}/ },
  { nome: 'token Bearer', re: /Bearer\s{1,5}[A-Za-z0-9._~+/=-]{16,500}/i },
  { nome: 'autenticação Basic', re: /Basic\s{1,5}[A-Za-z0-9+/=]{16,500}/i },
  { nome: 'token do GitHub', re: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,200}/ },
  { nome: 'token do GitHub (fine-grained)', re: /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{20,200}/ },
  { nome: 'token do npm', re: /(?<![A-Za-z0-9])npm_[A-Za-z0-9]{30,200}/ },
  { nome: 'token do GitLab', re: /(?<![A-Za-z0-9])glpat-[A-Za-z0-9_-]{15,200}/ },
  { nome: 'chave da AWS', re: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}/ },
  { nome: 'chave do Google', re: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/ },
  { nome: 'token do Hugging Face', re: /(?<![A-Za-z0-9])hf_[A-Za-z0-9]{30,200}/ },
  { nome: 'token do Slack', re: /(?<![A-Za-z0-9])xox[abprs]-[A-Za-z0-9-]{10,200}/ },
  { nome: 'JWT', re: /eyJ[A-Za-z0-9_-]{8,500}\.eyJ[A-Za-z0-9_-]{8,500}\.[A-Za-z0-9_-]{8,500}/ },
  { nome: 'chave privada', re: /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----/ },
  { nome: 'URL com usuário e senha', re: /\b[a-z][a-z0-9+.-]{1,15}:\/\/[^/\s:@]{1,64}:[^/\s]{1,128}@/i }, // `[^/\s]` (sem excluir @) cobre senhas que contêm @
  { nome: 'segredo na query string', re: /[?&](?:api[_-]?key|key|token|access_token|secret|password)=[A-Za-z0-9._~-]{8,200}/i },
  { nome: 'api_key literal', re: /api[_-]?key["']?\s{0,5}[:=]\s{0,5}["'][A-Za-z0-9._-]{16,200}["']/i },
  {
    nome: 'variável de segredo com valor',
    re: /\b[A-Z0-9_]{0,40}(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY)[A-Z0-9_]{0,40}\s{0,5}[:=]\s{0,5}["']?([^\s"']{8,200})/,
    filtro: (m) => {
      const valor = m[1];
      if (/^(process\.env|\$\{|\$[A-Z_]|<|\{\{|%)/i.test(valor)) return false; // referência a variável de ambiente ou marcador
      const entreAspas = /[:=]\s{0,5}["']/.test(m[0]);
      // sem aspas, um valor que é uma chamada ou o acesso a uma configuração (`int(os.environ.get(...))`, `os.environ[...]`, `env.CHAVE`) é código, não um segredo literal
      if (!entreAspas && (/^[A-Za-z_][\w.]*[([]/.test(valor) || /^(?:os\.environ|os\.getenv|env|ENV|Deno\.env|System\.getenv|getenv|config|settings|cfg)\b/.test(valor))) return false;
      return true;
    },
  },
  {
    nome: 'senha em texto',
    re: new RegExp(`\\b${PALAVRA_SENHA}\\b(?:\\s{1,3}(?:do|da|de|dos|das)\\s{1,3}[\\p{L}0-9_-]{1,30})?\\s{0,3}(?:é|is|[:=])\\s{0,3}["']?([A-Za-z0-9!@#%&*+_^~-][^\\s"',;]{5,127})`, 'iu'),
    filtro: (m) => pareceSenha(m[1]),
  },
];

/** Procura segredos em um texto. Devolve [{nome, linha}] sem nunca devolver o valor encontrado. */
export function acharSegredos(texto) {
  const achados = [];
  texto.split('\n').forEach((linha, i) => {
    if (linha.length > 20_000) linha = linha.slice(0, 20_000);
    for (const { nome, re, filtro } of SEGREDOS) {
      const m = re.exec(linha);
      if (m && (!filtro || filtro(m))) achados.push({ nome, linha: i + 1 });
    }
  });
  return achados;
}

const BLOCO_CHAVE_PRIVADA = /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----[\s\S]{0,20000}?(?:-----END [A-Z ]{0,30}PRIVATE KEY-----|$)/g;

/** Substitui por *** tudo que casa com um padrão de segredo. Opera sobre TEXTO; para objetos use `mascararProfundo`. */
export function mascararSegredos(texto) {
  let t = String(texto).replace(BLOCO_CHAVE_PRIVADA, '***');
  for (const { re, filtro } of SEGREDOS) {
    const global = new RegExp(re.source, `${re.flags.replace('g', '')}g`);
    t = t.replace(global, (...args) => {
      const grupos = args.slice(0, -2);
      return !filtro || filtro(grupos) ? '***' : grupos[0];
    });
  }
  return t;
}

/**
 * Mascara segredos em CADA string de um objeto (valores e chaves), antes de serializar. Mascarar o JSON já serializado falha:
 * as aspas viram \\" e padrões que dependem de aspas deixam de casar.
 */
export function mascararProfundo(valor, profundidade = 0) {
  if (profundidade > 40) return '[profundidade excedida]';
  if (typeof valor === 'string') return mascararSegredos(valor);
  if (Array.isArray(valor)) return valor.map((v) => mascararProfundo(v, profundidade + 1));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [mascararSegredos(k), mascararProfundo(v, profundidade + 1)]));
  }
  return valor;
}

// ---------------------------------------------------------------------------------------------------------------------
// Endereços e saída segura
// ---------------------------------------------------------------------------------------------------------------------

/** Endereço seguro para mostrar ou gravar: protocolo, host e caminho. Nunca usuário, senha, query nem fragmento. */
export function enderecoSeguro(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return null;
  }
}

/** Remove de um texto qualquer coisa que pareça credencial antes de ele ir para a tela ou para um arquivo. */
export function limparSaida(texto, { chave = '' } = {}) {
  let t = String(texto);
  t = t.replace(/(\b[a-z][a-z0-9+.-]{1,15}:\/\/)[^/\s]{0,300}@/gi, '$1***@'); // usuário:senha@ (inclusive com @ na senha)
  t = t.replace(/(?<=[\w/.-])\?(?=[\w.-]{1,60}=)[^\s"'<>]{0,500}/g, '?***'); // query strings
  if (chave.length >= 4) t = t.split(chave).join('***');
  t = t.replace(/\b(Bearer|Basic)\s{1,5}[A-Za-z0-9._~+/=-]{1,500}/gi, '$1 ***'); // na saída, qualquer valor após o esquema é suspeito
  t = mascararSegredos(t);
  t = t.replace(/(?<![A-Za-z0-9])(?:sk|pk|rk|hf|gh[pousr]|xox[abprs])[-_][A-Za-z0-9*._-]{6,200}/g, '***');
  t = t.replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,200}(?![A-Za-z0-9_-])/g, '***'); // sequências longas parecem tokens
  return t;
}

// ---------------------------------------------------------------------------------------------------------------------
// Texto exibido a humanos
// ---------------------------------------------------------------------------------------------------------------------
// Faixas por codigo numerico (sem caracteres invisiveis no codigo-fonte): C0, DEL+C1, espacos de largura zero e marcas bidi, isolados bidi, BOM.
const FAIXAS_CONTROLE = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]];
const CONTROLE = new RegExp(`[${FAIXAS_CONTROLE.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}]`);
const CONTROLE_G = new RegExp(CONTROLE.source, 'g');

/** Verdadeiro se o texto tem caracteres de controle, bidi ou invisíveis (usados para enganar quem lê num terminal). \\n e \\t são permitidos. */
export function temControle(texto) {
  return CONTROLE.test(String(texto).replace(/[\n\t]/g, ''));
}

/**
 * Para textos de várias linhas (resultados de agentes, diffs): mantém \n e \t, converte CRLF/CR em \n e torna visíveis
 * (`\u{...}`) todos os outros controles, bidi e invisíveis. Assim o texto pode ser mostrado ou enviado sem enganar o leitor.
 */
export function neutralizarControles(texto) {
  return String(texto).replace(/\r\n?/g, '\n').replace(CONTROLE_G, (c) => (c === '\n' || c === '\t' ? c : `\\u{${c.codePointAt(0).toString(16)}}`));
}

/** Torna um texto seguro para imprimir num terminal: controles e invisíveis viram `\u{...}` visíveis. */
export function paraTerminal(texto) {
  return String(texto).replace(CONTROLE_G, (c) => (c === '\n' ? '\\n' : c === '\t' ? '\\t' : `\\u{${c.codePointAt(0).toString(16)}}`));
}
