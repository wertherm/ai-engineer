// Cliente único do módulo: lê as variáveis de infra/.env.example com os mesmos defaults.
// Trocar Ollama -> OpenAI/OpenRouter/Bedrock (via gateway compatível) é só mudar o ambiente.
import OpenAI from 'openai';
import { Agent, fetch as undiciFetch } from 'undici';
import pg from 'pg';
import pgvector from 'pgvector';

export const config = {
  baseURL: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.OPENAI_API_KEY ?? 'ollama',
  modeloChat: process.env.MODELO_CHAT ?? 'qwen3.5:4b',
  modeloEmbed: process.env.MODELO_EMBED ?? 'qwen3-embedding:0.6b',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://ia:ia@localhost:5433/ia',
};

// O fetch nativo do Node corta a espera pelos headers em 300 s (headersTimeout do undici embutido).
// Com o Ollama em CPU e fila compartilhada, uma resposta pode demorar mais que isso: usamos o fetch
// do pacote undici com um Agent sem limite e deixamos o timeout do SDK (600 s) como teto único.
const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
const fetchSemCorte = (url, init) => undiciFetch(url, { ...init, dispatcher });

export const client = new OpenAI({
  baseURL: config.baseURL,
  apiKey: config.apiKey,
  timeout: 600_000,
  maxRetries: 0, // retry automático em LLM lento só duplica a fila
  fetch: fetchSemCorte,
});

// No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5 (senão ele gasta centenas de
// tokens pensando antes de responder, a ~5 tokens/s em CPU). Em outro provedor, não mandamos.
export const extrasOllama = config.baseURL.includes('11434') ? { reasoning_effort: 'none' } : {};

// Contadores do processo: todo exemplo imprime quantas chamadas e tokens gastou.
export const uso = { chamadas: 0, promptTokens: 0, completionTokens: 0, ms: 0 };

/** Uma chamada de Chat Completions (com ou sem tools). Devolve a mensagem e as métricas. */
export async function chat(messages, { tools, maxTokens = 200, temperature = 0, json = false } = {}) {
  const t0 = Date.now();
  const r = await client.chat.completions.create({
    model: config.modeloChat,
    messages,
    ...(tools?.length ? { tools } : {}),
    temperature,
    max_tokens: maxTokens,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...extrasOllama,
  });
  const ms = Date.now() - t0;
  uso.chamadas += 1;
  uso.promptTokens += r.usage?.prompt_tokens ?? 0;
  uso.completionTokens += r.usage?.completion_tokens ?? 0;
  uso.ms += ms;
  return { msg: r.choices[0].message, ms, finishReason: r.choices[0].finish_reason };
}

export async function embed(textos) {
  const r = await client.embeddings.create({ model: config.modeloEmbed, input: textos });
  return r.data.map((d) => d.embedding);
}

/** Pool do Postgres com o schema m06 garantido. Use só o schema m06 (nunca public). */
export async function criarPool() {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 3 });
  await pool.query('CREATE SCHEMA IF NOT EXISTS m06');
  return pool;
}

export const vetor = (v) => pgvector.toSql(v);

export function resumoUso() {
  return `${uso.chamadas} chamadas ao LLM · ${uso.promptTokens} tokens de prompt · ` +
    `${uso.completionTokens} de resposta · ${(uso.ms / 1000).toFixed(1)}s no modelo`;
}

/** Remove cercas ``` que modelos pequenos insistem em colocar em volta de código. */
export function tirarCercas(texto) {
  const m = (texto ?? '').match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
  return (m ? m[1] : texto ?? '').trim() + '\n';
}

/** Extrai um objeto/array JSON de um texto (com ou sem cercas). */
export function extrairJson(texto) {
  const limpo = (texto ?? '').replace(/```(?:json)?/g, '').trim();
  const ini = limpo.search(/[[{]/);
  if (ini < 0) throw new Error(`sem JSON na resposta: ${texto}`);
  const fecha = limpo[ini] === '[' ? ']' : '}';
  return JSON.parse(limpo.slice(ini, limpo.lastIndexOf(fecha) + 1));
}
