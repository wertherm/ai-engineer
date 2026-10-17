// Cliente único do módulo: lê as variáveis de infra/.env.example com os mesmos defaults.
// Trocar Ollama -> OpenAI/OpenRouter é só mudar o ambiente, sem tocar no código.
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

// No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5 (senão ele gasta centenas
// de tokens pensando antes de responder, a ~5 tokens/s em CPU). Em outro provedor, não mandamos.
export const extrasOllama = config.baseURL.includes('11434') ? { reasoning_effort: 'none' } : {};

// Contadores globais do processo: todo exemplo imprime quantas chamadas e tokens gastou.
export const uso = { chamadas: 0, promptTokens: 0, completionTokens: 0, ms: 0 };

/**
 * Uma chamada de Chat Completions (com ou sem tools). Devolve a mensagem do assistente
 * e métricas da chamada. Não decide nada: quem decide o próximo passo é o loop do agente.
 */
export async function chat(messages, { tools, maxTokens = 200, temperature = 0, json = false } = {}) {
  const t0 = Date.now();
  const r = await client.chat.completions.create({
    model: config.modeloChat,
    messages,
    ...(tools?.length ? { tools } : {}),
    temperature,
    max_tokens: maxTokens,
    // JSON mode: o servidor restringe a saída a JSON válido (o Ollama suporta via API compatível).
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...extrasOllama,
  });
  const ms = Date.now() - t0;
  uso.chamadas += 1;
  uso.promptTokens += r.usage?.prompt_tokens ?? 0;
  uso.completionTokens += r.usage?.completion_tokens ?? 0;
  uso.ms += ms;
  return { msg: r.choices[0].message, usage: r.usage, ms, finishReason: r.choices[0].finish_reason };
}

export async function embed(textos) {
  const r = await client.embeddings.create({ model: config.modeloEmbed, input: textos });
  return r.data.map((d) => d.embedding);
}

/** Pool do Postgres com o schema m04 garantido. Use só o schema m04 (nunca public). */
export async function criarPool() {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 3 });
  await pool.query('CREATE SCHEMA IF NOT EXISTS m04');
  return pool;
}

/** Converte number[] no literal do pgvector ('[0.1,0.2,...]') para usar como parâmetro $n::vector. */
export const vetor = (v) => pgvector.toSql(v);

export function resumoUso() {
  return `${uso.chamadas} chamadas ao LLM · ${uso.promptTokens} tokens de prompt · ` +
    `${uso.completionTokens} de resposta · ${(uso.ms / 1000).toFixed(1)}s no modelo`;
}

/** Tenta extrair um objeto/array JSON de um texto (modelos pequenos às vezes cercam com ```json). */
export function extrairJson(texto) {
  const limpo = (texto ?? '').replace(/```(?:json)?/g, '').trim();
  const ini = limpo.search(/[[{]/);
  if (ini < 0) throw new Error(`sem JSON na resposta: ${texto}`);
  const fecha = limpo[ini] === '[' ? ']' : '}';
  return JSON.parse(limpo.slice(ini, limpo.lastIndexOf(fecha) + 1));
}
