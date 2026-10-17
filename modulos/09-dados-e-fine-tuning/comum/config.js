// Configuração compartilhada pelos scripts JS do módulo 9.
// Tudo vem do ambiente com defaults locais (Ollama + Postgres de infra/): trocar para a OpenAI real
// é só exportar outras variáveis — o código não muda.
import OpenAI from 'openai';
import { Agent, fetch as undiciFetch } from 'undici';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const BASE_URL = process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1';
export const API_KEY = process.env.OPENAI_API_KEY ?? 'ollama';
export const MODELO_CHAT = process.env.MODELO_CHAT ?? 'qwen3.5:4b';
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://ia:ia@localhost:5433/ia';
export const SCHEMA = 'm09'; // schema exclusivo deste módulo no Postgres compartilhado

// Servidor local (Python) que serve o modelo base e o LoRA no formato OpenAI — exemplo 04.
export const LORA_BASE_URL = process.env.LORA_BASE_URL ?? 'http://localhost:30900/v1';

// Raiz do módulo, para os scripts acharem dados/ de qualquer pasta de onde forem chamados.
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DADOS = path.join(RAIZ, 'dados');

// Domínio (triagem de tickets de uma loja on-line fictícia): fonte única em comum/dominio.json, lida também
// pelo Python. O MESMO system prompt no dataset, no treino e na inferência — mudar uma vírgula é mudar a
// distribuição que o modelo viu no treino (armadilha clássica de fine-tuning).
const dominio = JSON.parse(fs.readFileSync(path.join(RAIZ, 'comum', 'dominio.json'), 'utf8'));
export const CATEGORIAS = dominio.categorias;
export const SYSTEM_PROMPT = dominio.system_prompt;

// O fetch nativo do Node corta em 300 s esperando headers (UND_ERR_HEADERS_TIMEOUT), mesmo com timeout
// maior no SDK. Com o Ollama disputado em CPU isso acontece: o único dono do prazo passa a ser o SDK.
const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
const fetchSemTimeout = (url, init) => undiciFetch(url, { ...init, dispatcher: agente });

export function criarCliente({ baseURL = BASE_URL, apiKey = API_KEY } = {}) {
  return new OpenAI({ baseURL, apiKey, timeout: 600_000, maxRetries: 0, fetch: fetchSemTimeout });
}

// No Ollama, reasoning_effort "none" desliga o thinking do qwen3.5 (senão gasta centenas de tokens).
export const extrasOllama = BASE_URL.includes('11434') ? { reasoning_effort: 'none' } : {};
