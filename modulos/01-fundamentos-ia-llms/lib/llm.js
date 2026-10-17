// Cliente único para todos os exemplos: lê as variáveis de infra/.env.example com os mesmos defaults.
// Trocar Ollama -> OpenAI/OpenRouter é só mudar o ambiente, sem tocar no código.
import OpenAI from 'openai';

export const config = {
  baseURL: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.OPENAI_API_KEY ?? 'ollama',
  modeloChat: process.env.MODELO_CHAT ?? 'qwen3.5:4b',
  modeloEmbed: process.env.MODELO_EMBED ?? 'qwen3-embedding:0.6b',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://ia:ia@localhost:5433/ia',
};

export const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, timeout: 600_000 });

// Ollama local: reasoning_effort "none" desliga o "thinking" do qwen3.5 (senão ele gasta
// centenas de tokens pensando antes de responder, a ~5 tokens/s em CPU).
const extrasOllama = config.baseURL.includes('11434') ? { reasoning_effort: 'none' } : {};

export async function chat(messages, { maxTokens = 80, temperature = 0 } = {}) {
  const t0 = Date.now();
  const r = await client.chat.completions.create({
    model: config.modeloChat,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...extrasOllama,
  });
  return {
    texto: r.choices[0].message.content ?? '',
    usage: r.usage,
    ms: Date.now() - t0,
    finishReason: r.choices[0].finish_reason,
  };
}

export async function embed(textos) {
  const r = await client.embeddings.create({ model: config.modeloEmbed, input: textos });
  return r.data.map((d) => d.embedding);
}
