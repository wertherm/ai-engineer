// Infra única do módulo: cliente de LLM, embeddings, Postgres (schema m08) e tabela de preços.
// Lê as variáveis de infra/.env.example com os mesmos defaults: trocar Ollama -> OpenAI/OpenRouter
// é só mudar o ambiente, sem tocar no código (Loose Coupling na prática).
import OpenAI from 'openai';
import pg from 'pg';
import pgvector from 'pgvector';

export const config = {
  baseURL: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.OPENAI_API_KEY ?? 'ollama',
  modeloChat: process.env.MODELO_CHAT ?? 'qwen3.5:4b',
  modeloEmbed: process.env.MODELO_EMBED ?? 'qwen3-embedding:0.6b',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://ia:ia@localhost:5433/ia',
};

export const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, timeout: 900_000 });

// No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5 (senão ele gasta centenas de
// tokens pensando a ~5 tokens/s em CPU). Em outro provedor, não mandamos o campo.
export const extrasOllama = config.baseURL.includes('11434') ? { reasoning_effort: 'none' } : {};

/**
 * Tabela de preços FICTÍCIA e configurável (US$ por 1 milhão de tokens). Localmente os dois tiers são o
 * mesmo modelo; o que muda é o preço de tabela e o limite de saída. Assim o raciocínio de custo é o
 * mesmo que você faria com dois modelos reais (ex.: um "mini" e um "flagship").
 * Ajuste via env: PRECOS='{"barato":{"in":0.15,"out":0.6},"caro":{"in":3,"out":15}}'
 */
export const precos = JSON.parse(
  process.env.PRECOS ?? '{"barato":{"in":0.15,"out":0.6},"caro":{"in":3,"out":15}}',
);

export function custoUSD(tier, usage) {
  const p = precos[tier];
  if (!p || !usage) return 0;
  return (usage.prompt_tokens * p.in + usage.completion_tokens * p.out) / 1_000_000;
}

/** Uma chamada de Chat Completions com métricas (latência e tokens). */
export async function chat(messages, { tools, maxTokens = 60, temperature = 0 } = {}) {
  const t0 = performance.now();
  const r = await client.chat.completions.create({
    model: config.modeloChat,
    messages,
    ...(tools?.length ? { tools } : {}),
    temperature,
    max_tokens: maxTokens,
    ...extrasOllama,
  });
  return {
    msg: r.choices[0].message,
    texto: (r.choices[0].message.content ?? '').trim(),
    usage: r.usage,
    ms: Math.round(performance.now() - t0),
  };
}

/**
 * Chamada com streaming: mede o TTFT (tempo até o primeiro token), que é o que o usuário "sente".
 * include_usage pede ao servidor um último chunk com a contagem de tokens.
 */
export async function chatStream(messages, { maxTokens = 60, onToken = () => {} } = {}) {
  const t0 = performance.now();
  const stream = await client.chat.completions.create({
    model: config.modeloChat,
    messages,
    temperature: 0,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
    ...extrasOllama,
  });
  let texto = '';
  let ttft = null;
  let usage = null;
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      if (ttft === null) ttft = Math.round(performance.now() - t0);
      texto += delta;
      onToken(delta);
    }
    if (chunk.usage) usage = chunk.usage;
  }
  return { texto: texto.trim(), usage, ttft, ms: Math.round(performance.now() - t0) };
}

export async function embed(textos) {
  const r = await client.embeddings.create({ model: config.modeloEmbed, input: textos });
  return r.data.map((d) => d.embedding);
}

/** Pool do Postgres com o schema m08 e a extensão vector. Use só o schema m08 (nunca public). */
export async function criarPool() {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
  await pool.query('CREATE SCHEMA IF NOT EXISTS m08');
  return pool;
}

/** Converte number[] no literal do pgvector para usar como parâmetro $n::vector. */
export const vetor = (v) => pgvector.toSql(v);

/** Formata linhas como tabela de texto alinhada (para relatórios no terminal). */
export function tabela(linhas) {
  const cols = Object.keys(linhas[0]);
  const larg = cols.map((c) => Math.max(c.length, ...linhas.map((l) => String(l[c]).length)));
  const fmt = (vals) => vals.map((v, i) => String(v).padEnd(larg[i])).join(' | ');
  return [fmt(cols), larg.map((n) => '-'.repeat(n)).join('-|-'), ...linhas.map((l) => fmt(cols.map((c) => l[c])))].join('\n');
}
