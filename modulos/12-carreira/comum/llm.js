// Cliente do LLM do módulo: lê as variáveis de infra/.env.example com os mesmos defaults.
// Trocar Ollama -> OpenAI/OpenRouter é só mudar o ambiente, sem tocar no código.
import OpenAI from 'openai';

export const config = {
  baseURL: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.OPENAI_API_KEY ?? 'ollama',
  modeloChat: process.env.MODELO_CHAT ?? 'qwen3.5:4b',
};

// Timeout alto: o Ollama em CPU é compartilhado e uma resposta curta pode levar minutos.
const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, timeout: 600_000, maxRetries: 0 });

// No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5 (senão ele gasta centenas de tokens
// pensando antes de responder). Em outro provedor não mandamos o campo.
const extrasOllama = config.baseURL.includes('11434') ? { reasoning_effort: 'none' } : {};

/** Uma chamada curta de Chat Completions; devolve texto, uso de tokens e tempo. */
export async function chat(messages, { maxTokens = 160 } = {}) {
  const t0 = Date.now();
  const r = await client.chat.completions.create({
    model: config.modeloChat,
    messages,
    temperature: 0,
    max_tokens: maxTokens,
    ...extrasOllama,
  });
  return { texto: r.choices[0].message.content ?? '', usage: r.usage, ms: Date.now() - t0 };
}
