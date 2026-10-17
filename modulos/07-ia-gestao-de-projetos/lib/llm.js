// Cliente LLM compartilhado pelos exemplos do módulo.
// Lê as mesmas variáveis do infra/.env.example: trocar Ollama por OpenAI/OpenRouter é só mudar o ambiente.
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';

export const MODELO = process.env.MODELO_CHAT ?? 'qwen3.5:4b';
const ehOllama = (process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1').includes('11434');

export const client = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.OPENAI_API_KEY ?? 'ollama',
  timeout: 600_000, // CPU lenta: 5 tokens/s
});

// Parâmetros extras só para o Ollama: desliga o "thinking" do qwen3.5 (senão gasta centenas de tokens pensando).
const extras = ehOllama ? { reasoning_effort: 'none' } : {};

/**
 * Pede ao LLM um JSON que obedeça ao schema zod (structured output).
 * O SDK converte o zod em JSON Schema, o servidor restringe a geração e o SDK valida de novo na volta.
 */
export async function extrairJson({ schema, nome, system, user, maxTokens = 600 }) {
  const resp = await client.chat.completions.parse({
    model: MODELO,
    temperature: 0,
    max_tokens: maxTokens,
    ...extras,
    response_format: zodResponseFormat(schema, nome),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const msg = resp.choices[0].message;
  if (resp.choices[0].finish_reason === 'length') {
    throw new Error(`Resposta cortada em ${maxTokens} tokens: aumente maxTokens ou peça menos itens.`);
  }
  // .parsed já passou pelo schema.parse() do zod; se o JSON não bater, o SDK lança erro antes daqui.
  return msg.parsed;
}

/** Texto livre curto (justificativas, resumos). */
export async function gerarTexto({ system, user, maxTokens = 200 }) {
  const resp = await client.chat.completions.create({
    model: MODELO,
    temperature: 0,
    max_tokens: maxTokens,
    ...extras,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return resp.choices[0].message.content.trim();
}
