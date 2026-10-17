// Configuração única do Micro-SaaS. Tudo vem do ambiente com defaults locais (infra/.env.example):
// trocar Ollama -> OpenAI/OpenRouter, ou o Postgres local por um gerenciado, é só mudar variáveis.
import OpenAI from 'openai';
import { Agent, fetch as undiciFetch } from 'undici';

export const config = {
  baseURL: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.OPENAI_API_KEY ?? 'ollama',
  modeloChat: process.env.MODELO_CHAT ?? 'qwen3.5:4b',
  modeloEmbed: process.env.MODELO_EMBED ?? 'qwen3-embedding:0.6b',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://ia:ia@localhost:5433/ia',
  schema: 'm11', // schema exclusivo deste módulo no Postgres compartilhado (nunca o public)
  porta: Number(process.env.PORT ?? 31100),
  host: process.env.HOST ?? '127.0.0.1',
};

// No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5 (senão ele gasta centenas de
// tokens pensando, a ~5 tokens/s em CPU). Em outro provedor não mandamos o parâmetro.
export const extrasProvedor = config.baseURL.includes('11434') ? { reasoning_effort: 'none' } : {};

// O fetch nativo do Node (undici) desiste se os headers não chegam em 300 s (UND_ERR_HEADERS_TIMEOUT),
// mesmo com timeout maior no SDK. Com o Ollama em CPU enfileirando pedidos de outros processos, isso
// acontece. Desligamos os timeouts do undici e deixamos um único dono do prazo: o `timeout` do SDK.
// (mesma solução do módulo 02, comum/config.js)
const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
const fetchSemTimeout = (url, init) => undiciFetch(url, { ...init, dispatcher });

export const openai = new OpenAI({
  baseURL: config.baseURL,
  apiKey: config.apiKey,
  timeout: 900_000,
  maxRetries: 1,
  fetch: fetchSemTimeout,
});
