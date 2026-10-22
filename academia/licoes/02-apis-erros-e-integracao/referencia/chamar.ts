// Solução de referência da Lição 2: um cliente de LLM robusto, em TypeScript.
//
//   node chamar.ts "Diga olá em uma palavra."        (precisa de Node 22.18+ ou 24+; veja a seção 4.5 da lição)
//
// Só usa sintaxe "apagável" (sem enum, sem namespace com código, sem parameter properties): o Node apenas remove os tipos e executa,
// sem conferi-los. Para conferir os tipos, use o tsc (veja kit/tsconfig.json e a seção 4.5).
// Contrato (variáveis de ambiente, formato do JSON de saída, os nove tipos de erro): kit/contrato.mjs e a seção 8 da lição.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------------------------
// Tipos: o erro é uma UNIÃO de nomes fechados; quem trata a falha é obrigado, pelo compilador, a pensar em cada caso.
// ---------------------------------------------------------------------------------------------------------------------------------
export type TipoDeErro =
  | 'rede' | 'timeout' | 'limite_de_taxa' | 'servidor' // vale tentar de novo
  | 'cota_esgotada' | 'autenticacao' | 'requisicao_invalida' | 'truncado' | 'resposta_invalida'; // tentar de novo só repete o problema

const REPETIVEIS: ReadonlySet<TipoDeErro> = new Set<TipoDeErro>(['rede', 'timeout', 'limite_de_taxa', 'servidor']);

export interface Uso { prompt_tokens: number; completion_tokens: number; total_tokens: number }
export interface Sucesso { texto: string; finish_reason: string; usage: Uso }

export interface Configuracao {
  baseURL: string;
  chave: string;
  modelo: string;
  paramMaxTokens: string;
  temperatura: number | null; // null = não enviar o campo
  maxTokens: number;
  timeoutMs: number;
  maxTentativas: number;
  backoffBaseMs: number;
  backoffTetoMs: number;
  esperaMaxMs: number;
}

export class ErroLLM extends Error {
  readonly tipo: TipoDeErro;
  readonly status: number | null;
  readonly esperaSugeridaMs: number | null; // do cabeçalho Retry-After, se houve
  tentativas = 0;

  constructor(tipo: TipoDeErro, mensagem: string, opcoes: { status?: number | null; esperaSugeridaMs?: number | null } = {}) {
    super(mensagem);
    this.name = 'ErroLLM';
    this.tipo = tipo;
    this.status = opcoes.status ?? null;
    this.esperaSugeridaMs = opcoes.esperaSugeridaMs ?? null;
  }

  get repetivel(): boolean {
    return REPETIVEIS.has(this.tipo);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Configuração: tudo vem do ambiente. Trocar de provedor é trocar variáveis, nunca editar este arquivo.
// ---------------------------------------------------------------------------------------------------------------------------------
type Ambiente = Record<string, string | undefined>;

function inteiro(env: Ambiente, nome: string, padrao: number, minimo: number, maximo = Number.MAX_SAFE_INTEGER): number {
  const bruto = env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < minimo || n > maximo) throw new Error(`${nome} deve ser um inteiro de ${minimo} a ${maximo} (veio "${bruto}")`);
  return n;
}

export function lerConfiguracao(env: Ambiente): Configuracao {
  const obrigatoria = (nome: string): string => {
    const v = env[nome];
    if (!v) throw new Error(`defina a variável de ambiente ${nome}`);
    return v;
  };
  const baseURL = obrigatoria('OPENAI_BASE_URL').replace(/\/+$/, '');
  try {
    const u = new URL(baseURL);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocolo');
  } catch {
    throw new Error('OPENAI_BASE_URL deve ser uma URL http:// ou https://');
  }
  const paramMaxTokens = env.PARAM_MAX_TOKENS || 'max_tokens';
  if (!/^[a-z_]{3,40}$/.test(paramMaxTokens)) throw new Error('PARAM_MAX_TOKENS deve ser um nome de campo como max_tokens ou max_completion_tokens');
  let temperatura: number | null = 0;
  const t = env.TEMPERATURA ?? '0';
  if (t === 'omitir') temperatura = null;
  else if (t !== '' && Number.isFinite(Number(t)) && Number(t) >= 0 && Number(t) <= 2) temperatura = Number(t);
  else if (t !== '') throw new Error('TEMPERATURA deve ser um número de 0 a 2 ou "omitir"');
  return {
    baseURL,
    chave: obrigatoria('OPENAI_API_KEY'),
    modelo: obrigatoria('MODELO_CHAT'),
    paramMaxTokens,
    temperatura,
    maxTokens: inteiro(env, 'MAX_TOKENS', 64, 1, 100_000),
    timeoutMs: inteiro(env, 'TIMEOUT_MS', 30_000, 1, 600_000),
    maxTentativas: inteiro(env, 'MAX_TENTATIVAS', 3, 1, 10),
    backoffBaseMs: inteiro(env, 'BACKOFF_BASE_MS', 500, 0),
    backoffTetoMs: inteiro(env, 'BACKOFF_TETO_MS', 8_000, 0),
    esperaMaxMs: inteiro(env, 'ESPERA_MAX_MS', 60_000, 0),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Segredos: a chave vai no cabeçalho e some de qualquer texto que sai do programa (alguns provedores a repetem na mensagem de erro).
// ---------------------------------------------------------------------------------------------------------------------------------
export function mascarar(texto: string, chave: string): string {
  let t = texto;
  if (chave.length >= 4) t = t.split(chave).join('***');
  t = t.replace(/\bsk-[A-Za-z0-9_-]{6,}/g, '***').replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer ***');
  return t.replace(/\s+/g, ' ').trim().slice(0, 300);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Espera entre tentativas
// ---------------------------------------------------------------------------------------------------------------------------------

/** Retry-After pode ser um número de segundos ou uma data HTTP. Devolve milissegundos, ou null se não entender. */
export function lerRetryAfter(valor: string | null, agora: number = Date.now()): number | null {
  if (valor === null) return null;
  const v = valor.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const data = Date.parse(v);
  return Number.isNaN(data) ? null : Math.max(0, data - agora);
}

/** Backoff exponencial com *full jitter*: sorteia entre 0 e min(teto, base × 2^(n−1)), onde n é a tentativa que acabou de falhar. */
export function esperaDeBackoff(tentativaQueFalhou: number, baseMs: number, tetoMs: number, aleatorio: () => number = Math.random): number {
  const limite = Math.min(tetoMs, baseMs * 2 ** (tentativaQueFalhou - 1));
  return Math.floor(aleatorio() * limite);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Uma tentativa: traduz o que aconteceu (ou não aconteceu) para um dos nove tipos
// ---------------------------------------------------------------------------------------------------------------------------------
const PADRAO_DE_COTA = /quota|credit|spend_limit|usage_limit|billing/i;

function erroDeHttp(status: number, corpo: string, cabecalhos: Headers, chave: string): ErroLLM {
  let codigo = '';
  let mensagem = corpo;
  try {
    const e = (JSON.parse(corpo) as { error?: { code?: unknown; type?: unknown; message?: unknown; details?: { error_code?: unknown } } }).error;
    // OpenAI: `code` e `type`; Anthropic: o 429 de teto de gasto tem o mesmo `type` de um limite de taxa e só `details.error_code` o distingue
    const detalhe = typeof e?.details?.error_code === 'string' ? e.details.error_code : '';
    codigo = `${typeof e?.code === 'string' ? e.code : ''} ${typeof e?.type === 'string' ? e.type : ''} ${detalhe}`;
    if (typeof e?.message === 'string') mensagem = e.message;
  } catch { /* corpo que não é JSON: usa o texto cru, cortado */ }
  const texto = `HTTP ${status}: ${mascarar(mensagem, chave)}`;
  const espera = lerRetryAfter(cabecalhos.get('retry-after'));
  if (status === 401 || status === 403) return new ErroLLM('autenticacao', texto, { status });
  if (status === 429) return PADRAO_DE_COTA.test(codigo) ? new ErroLLM('cota_esgotada', texto, { status }) : new ErroLLM('limite_de_taxa', texto, { status, esperaSugeridaMs: espera });
  if (status === 408 || status >= 500) return new ErroLLM('servidor', texto, { status, esperaSugeridaMs: espera });
  return new ErroLLM('requisicao_invalida', texto, { status }); // 4xx e redirecionamentos (não os seguimos: o destino é decidido por quem respondeu, não por você)
}

async function umaTentativa(prompt: string, cfg: Configuracao): Promise<Sucesso> {
  const corpo: Record<string, unknown> = { model: cfg.modelo, messages: [{ role: 'user', content: prompt }], [cfg.paramMaxTokens]: cfg.maxTokens };
  if (cfg.temperatura !== null) corpo.temperature = cfg.temperatura;
  const alvo = new URL(cfg.baseURL);

  let resposta: Response;
  let texto: string;
  try {
    // AbortSignal.timeout vale para a tentativa INTEIRA: conexão, cabeçalhos e corpo (o fetch sozinho espera por minutos).
    resposta = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.chave}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    texto = await resposta.text();
  } catch (e) {
    const nome = e instanceof Error ? e.name : '';
    if (nome === 'TimeoutError' || nome === 'AbortError') throw new ErroLLM('timeout', `sem resposta completa em ${cfg.timeoutMs} ms`);
    throw new ErroLLM('rede', `não foi possível falar com ${alvo.protocol}//${alvo.host}`); // sem a URL inteira: ela pode ter usuário e senha
  }

  if (resposta.status < 200 || resposta.status >= 300) throw erroDeHttp(resposta.status, texto, resposta.headers, cfg.chave);

  let dados: { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[]; usage?: Partial<Uso> };
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new ErroLLM('resposta_invalida', `HTTP ${resposta.status} com corpo que não é JSON`, { status: resposta.status });
  }
  const escolha = dados?.choices?.[0];
  const conteudo = escolha?.message?.content;
  if (typeof conteudo !== 'string' || typeof escolha?.finish_reason !== 'string') {
    throw new ErroLLM('resposta_invalida', `HTTP ${resposta.status} sem choices[0].message.content e finish_reason`, { status: resposta.status });
  }
  if (escolha.finish_reason === 'length') {
    throw new ErroLLM('truncado', `a resposta foi cortada em ${cfg.maxTokens} tokens (finish_reason "length"): aumente MAX_TOKENS ou simplifique o pedido`, { status: resposta.status });
  }
  const uso = dados.usage ?? {};
  return {
    texto: conteudo,
    finish_reason: escolha.finish_reason,
    usage: { prompt_tokens: uso.prompt_tokens ?? 0, completion_tokens: uso.completion_tokens ?? 0, total_tokens: uso.total_tokens ?? 0 },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Várias tentativas, só nas falhas que se resolvem sozinhas
// ---------------------------------------------------------------------------------------------------------------------------------
export interface Ganchos {
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
  registrar?: (mensagem: string) => void;
}

export async function chamar(prompt: string, cfg: Configuracao, ganchos: Ganchos = {}): Promise<Sucesso & { tentativas: number }> {
  const dormir = ganchos.dormir ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let tentativa = 1; ; tentativa++) {
    try {
      return { ...(await umaTentativa(prompt, cfg)), tentativas: tentativa };
    } catch (e) {
      const erro = e instanceof ErroLLM ? e : new ErroLLM('rede', mascarar(String(e), cfg.chave));
      erro.tentativas = tentativa;
      if (!erro.repetivel || tentativa >= cfg.maxTentativas) throw erro;
      const pedida = erro.esperaSugeridaMs;
      if (pedida !== null && pedida > cfg.esperaMaxMs) throw erro; // o provedor pediu mais espera do que aceitamos: desista, não trave
      const espera = pedida ?? esperaDeBackoff(tentativa, cfg.backoffBaseMs, cfg.backoffTetoMs, ganchos.aleatorio);
      ganchos.registrar?.(`tentativa ${tentativa} falhou (${erro.tipo}); esperando ${espera} ms`);
      await dormir(espera);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Linha de comando: uma linha JSON no stdout, logs no stderr, código 0 (sucesso), 1 (falha da chamada) ou 2 (uso/configuração)
// ---------------------------------------------------------------------------------------------------------------------------------
async function principal(argv: string[], env: Ambiente): Promise<number> {
  const prompt = argv[0];
  if (!prompt) {
    console.error('uso: node chamar.ts "<prompt>"');
    return 2;
  }
  let cfg: Configuracao;
  try {
    cfg = lerConfiguracao(env);
  } catch (e) {
    console.error(`configuração inválida: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  try {
    const r = await chamar(prompt, cfg, { registrar: (m) => console.error(m) });
    console.log(JSON.stringify({ ok: true, ...r }));
    return 0;
  } catch (e) {
    const erro = e instanceof ErroLLM ? e : new ErroLLM('rede', mascarar(String(e), cfg.chave));
    console.log(JSON.stringify({ ok: false, erro: { tipo: erro.tipo, repetivel: erro.repetivel, status: erro.status, mensagem: mascarar(erro.message, cfg.chave) }, tentativas: erro.tentativas || 1 }));
    return 1;
  }
}

/** Verdadeiro se este arquivo é o programa que o Node está executando (compara os caminhos REAIS: symlinks e junctions não enganam). */
function ehPrincipal(): boolean {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (ehPrincipal()) {
  process.exitCode = await principal(process.argv.slice(2), process.env);
}
