// Solução de referência do laboratório da Lição 1 · Medidor de tokens e contexto.
// Só abra depois de tentar (e de usar as dicas da seção 11 da lição).
//
//   node medir.mjs <pasta-de-saida>      # grava <pasta-de-saida>/relatorio.json
//
// Variáveis: OPENAI_BASE_URL, OPENAI_API_KEY, MODELO_CHAT, PARAM_MAX_TOKENS (veja exemplos/chamada-minima.mjs).
// A chave nunca é gravada no relatório.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { enderecoSeguro, limparSaida } from '../../../ferramentas/comum.mjs';
import {
  FATO, MAX_TOKENS_CURTO, MAX_TOKENS_LONGO, MAX_TOKENS_MEDICAO, MAX_TOKENS_TRUNCAMENTO, MSG_FATO,
  MSG_PERGUNTA, PEDIDO_LONGO, PEDIDO_TRUNCAMENTO, REPETICOES, TEXTO_EN, TEXTO_PT,
} from '../kit/textos.mjs';

const baseURL = process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1';
const apiKey = process.env.OPENAI_API_KEY ?? 'ollama';
const modelo = process.env.MODELO_CHAT ?? 'qwen3.5:4b';
const paramLimite = process.env.PARAM_MAX_TOKENS ?? 'max_tokens';
// Alguns modelos de raciocínio rejeitam `temperature` diferente do padrão: TEMPERATURA=omitir não envia o campo.
const temperatura = process.env.TEMPERATURA === 'omitir' ? undefined : Number(process.env.TEMPERATURA ?? 0) || 0;
const timeoutMs = Number(process.env.TIMEOUT_MS) || 300_000;
const saida = path.resolve(process.argv[2] ?? '.');

const chamadas = [];

// Uma chamada de chat. Registra o que o servidor reportou (`usage`), nunca uma estimativa nossa.
async function chamar(id, experimento, messages, maxTokens) {
  const corpo = {
    model: modelo,
    messages,
    ...(temperatura === undefined ? {} : { temperature: temperatura }),
    [paramLimite]: maxTokens,
    ...(baseURL.includes(':11434') ? { reasoning_effort: 'none' } : {}),
  };
  const t0 = performance.now();
  let r;
  try {
    r = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // mensagens de erro do fetch podem repetir a URL inteira, com usuário, senha ou ?chave=
    throw new Error(`${id}: ${limparSaida(e.cause?.code ?? e.message, { chave: apiKey })}`);
  }
  const latenciaMs = Math.max(1, Math.round(performance.now() - t0));
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status} ${limparSaida((await r.text()).slice(0, 200), { chave: apiKey })}`);
  const j = await r.json();
  const u = j.usage;
  const registro = {
    id,
    experimento,
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
    total_tokens: u.total_tokens ?? u.prompt_tokens + u.completion_tokens,
    finish_reason: j.choices[0].finish_reason,
    latencia_ms: latenciaMs,
    max_tokens: maxTokens,
    resposta: (j.choices[0].message.content ?? '').slice(0, 500),
  };
  chamadas.push(registro);
  console.log(`${id.padEnd(12)} prompt=${registro.prompt_tokens} saída=${registro.completion_tokens} ` +
    `${registro.finish_reason} ${latenciaMs}ms`);
  return registro;
}

const user = (content) => ({ role: 'user', content });

// 1. Idioma: o mesmo conteúdo em português e em inglês.
const pt = await chamar('idioma-pt', 'idioma', [user(TEXTO_PT)], MAX_TOKENS_MEDICAO);
const en = await chamar('idioma-en', 'idioma', [user(TEXTO_EN)], MAX_TOKENS_MEDICAO);

// 2. Crescimento: o prompt cresce com as repetições; a inclinação separa o custo por caractere do custo fixo.
const pontos = [];
for (const n of REPETICOES) {
  const texto = Array(n).fill(TEXTO_PT).join('\n\n');
  const c = await chamar(`cresc-${n}`, 'crescimento', [user(texto)], MAX_TOKENS_MEDICAO);
  pontos.push({ id: c.id, chars: texto.length, tokens: c.prompt_tokens });
}
const primeiro = pontos[0];
const ultimo = pontos.at(-1);
const tokensPorChar = (ultimo.tokens - primeiro.tokens) / (ultimo.chars - primeiro.chars);
const overheadFixo = primeiro.tokens - tokensPorChar * primeiro.chars;

// 3. Truncamento: max_tokens baixo corta a resposta.
await chamar('trunc', 'truncamento', [user(PEDIDO_TRUNCAMENTO)], MAX_TOKENS_TRUNCAMENTO);

// 4. Sem memória: a API não guarda a conversa; quem lembra é quem reenvia o histórico.
const fato = await chamar('mem-fato', 'sem_memoria', [user(MSG_FATO)], MAX_TOKENS_CURTO);
const sem = await chamar('mem-sem', 'sem_memoria', [user(MSG_PERGUNTA)], MAX_TOKENS_CURTO);
const com = await chamar('mem-com', 'sem_memoria', [
  user(MSG_FATO),
  { role: 'assistant', content: fato.resposta },
  user(MSG_PERGUNTA),
], MAX_TOKENS_CURTO);
const lembrou = (c) => c.resposta.toLowerCase().includes(FATO.toLowerCase());

// 5. Decodificação: a saída é gerada token a token, então mais tokens de saída = mais tempo.
const curta = await chamar('dec-curta', 'decodificacao', [user(PEDIDO_LONGO)], MAX_TOKENS_CURTO);
const longa = await chamar('dec-longa', 'decodificacao', [user(PEDIDO_LONGO)], MAX_TOKENS_LONGO);

const relatorio = {
  versao: 1,
  gerado_em: new Date().toISOString(),
  // Só protocolo, host e caminho: URLs podem trazer usuário, senha ou ?chave=... e o relatório vai para o repositório.
  ambiente: { base_url: enderecoSeguro(baseURL) ?? '(URL inválida)', modelo, node: process.version },
  chamadas,
  experimentos: {
    idioma: {
      chamada_pt: pt.id,
      chamada_en: en.id,
      chars_pt: TEXTO_PT.length,
      chars_en: TEXTO_EN.length,
      razao_tokens_pt_en: pt.prompt_tokens / en.prompt_tokens,
    },
    crescimento: {
      chamadas: pontos.map((p) => p.id),
      chars: pontos.map((p) => p.chars),
      tokens_por_char_marginal: tokensPorChar,
      overhead_fixo_tokens: overheadFixo,
    },
    truncamento: { chamada: 'trunc', max_tokens: MAX_TOKENS_TRUNCAMENTO },
    sem_memoria: {
      fato: FATO,
      sem_historico: sem.id,
      com_historico: com.id,
      sem_historico_lembrou: lembrou(sem),
      com_historico_lembrou: lembrou(com),
      tokens_extra_do_historico: com.prompt_tokens - sem.prompt_tokens,
    },
    decodificacao: {
      curta: curta.id,
      longa: longa.id,
      ms_por_token_saida: longa.completion_tokens > curta.completion_tokens
        ? (longa.latencia_ms - curta.latencia_ms) / (longa.completion_tokens - curta.completion_tokens)
        : null,
    },
  },
};

await mkdir(saida, { recursive: true });
await writeFile(path.join(saida, 'relatorio.json'), JSON.stringify(relatorio, null, 2) + '\n');
console.log(`\nrelatório gravado em ${path.join(saida, 'relatorio.json')}`);
