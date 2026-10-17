// Configuração compartilhada pelos exemplos do módulo 5.
// Tudo vem do ambiente com defaults locais (Ollama + Postgres de infra/): trocar para a OpenAI
// ou o OpenRouter é só exportar outras variáveis, o código não muda.
import OpenAI from 'openai';
import { Agent, fetch as undiciFetch } from 'undici';

export const BASE_URL = process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1';
export const API_KEY = process.env.OPENAI_API_KEY ?? 'ollama';
export const MODELO_CHAT = process.env.MODELO_CHAT ?? 'qwen3.5:4b';
export const MODELO_EMBED = process.env.MODELO_EMBED ?? 'qwen3-embedding:0.6b';
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://ia:ia@localhost:5433/ia';
export const SCHEMA = 'm05'; // schema exclusivo deste módulo no Postgres compartilhado

// Parâmetros previsíveis para o modelo local: sem thinking (reasoning_effort "none") e sem
// aleatoriedade. Em CPU cada token conta (~5 tokens/s), então cada exemplo define max_tokens baixo.
export const PADRAO = { reasoning_effort: 'none', temperature: 0, seed: 42 };

// O fetch nativo do Node corta em 300 s se os headers não chegam (UND_ERR_HEADERS_TIMEOUT), mesmo
// com timeout maior no SDK. Com o Ollama compartilhado e enfileirado, isso acontece. Desligamos os
// timeouts do undici e deixamos um único dono do prazo: o `timeout` do SDK. 600 s não bastou com o
// Ollama compartilhado por vários processos (APIConnectionTimeoutError na fila): default de 900 s,
// ajustável por LLM_TIMEOUT_MS.
const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
const fetchSemTimeout = (url, init) => undiciFetch(url, { ...init, dispatcher: agente });

export function criarCliente(opcoes = {}) {
  return new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY, timeout: Number(process.env.LLM_TIMEOUT_MS ?? 900_000), maxRetries: 0, fetch: fetchSemTimeout, ...opcoes });
}

// Uma chamada de chat curta, com medição de tempo (útil para enxergar o custo em CPU).
export async function conversar(cliente, mensagens, { maxTokens = 400 } = {}) {
  const inicio = Date.now();
  const r = await cliente.chat.completions.create({ model: MODELO_CHAT, messages: mensagens, max_tokens: maxTokens, ...PADRAO });
  return { texto: r.choices[0].message.content ?? '', segundos: Math.round((Date.now() - inicio) / 1000), uso: r.usage, fim: r.choices[0].finish_reason };
}

// Modelos pequenos costumam embrulhar código em ```html ... ```. Extraímos o primeiro bloco
// (ou devolvemos o texto inteiro se não houver cerca).
export function extrairCodigo(texto, linguagem = '') {
  const re = new RegExp('```' + linguagem + '[a-z]*\\n([\\s\\S]*?)```', 'i');
  const m = texto.match(re) ?? texto.match(/```[a-z]*\n([\s\S]*?)```/i);
  if (m) return m[1].trim();
  // Resposta cortada por max_tokens: tem a cerca de abertura mas não a de fechamento.
  return texto.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();
}
