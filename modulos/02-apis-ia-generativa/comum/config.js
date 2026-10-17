// Configuração compartilhada pelos exemplos do módulo 2.
// Tudo vem do ambiente com defaults locais (Ollama + Postgres do infra/), então trocar
// para a OpenAI ou o OpenRouter é só exportar outras variáveis — o código não muda.
import OpenAI from "openai";
import { Agent, fetch as undiciFetch } from "undici";

export const BASE_URL = process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1";
export const API_KEY = process.env.OPENAI_API_KEY ?? "ollama";
export const MODELO_CHAT = process.env.MODELO_CHAT ?? "qwen3.5:4b";
export const MODELO_EMBED = process.env.MODELO_EMBED ?? "qwen3-embedding:0.6b";
export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://ia:ia@localhost:5433/ia";
export const SCHEMA = "m02"; // schema exclusivo deste módulo no Postgres compartilhado

// Parâmetros "previsíveis" para o modelo local: sem thinking e sem aleatoriedade.
// reasoning_effort "none" desliga o modo de raciocínio do qwen3.5 (senão ele gasta
// centenas de tokens "pensando" antes de responder, o que em CPU custa minutos).
export const PADRAO = { reasoning_effort: "none", temperature: 0, seed: 42 };

// O fetch nativo do Node (undici) desiste se os headers da resposta não chegam em 300 s
// (UND_ERR_HEADERS_TIMEOUT), MESMO com timeout maior no SDK. Em CPU, com o Ollama enfileirando
// pedidos de outros processos, uma chamada com imagem passa disso. Desligamos os timeouts do
// undici e deixamos um único dono do prazo: o `timeout` do SDK.
const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
export const fetchSemTimeout = (url, init) => undiciFetch(url, { ...init, dispatcher: agente });

export function criarCliente(opcoes = {}) {
  // timeout generoso: em CPU, com outros processos usando o Ollama, uma chamada pode levar minutos.
  return new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY, timeout: 900_000, maxRetries: 0, fetch: fetchSemTimeout, ...opcoes });
}
