// Contagem de tokens de uma conversa no formato chat, como a OpenAI faz para cobrar treino.
// js-tiktoken é a porta JS do tiktoken; "o200k_base" é a codificação dos modelos gpt-4o/gpt-4.1.
import { getEncoding } from 'js-tiktoken';

const enc = getEncoding('o200k_base');

// Fórmula do cookbook da OpenAI (chat fine-tuning data prep): ~3 tokens de "moldura" por mensagem
// (<|start|>role ... <|end|>) + 3 tokens que preparam a resposta. É uma ESTIMATIVA: a cobrança real
// aparece em `trained_tokens` do job.
const TOKENS_POR_MENSAGEM = 3;
const TOKENS_RESPOSTA = 3;

export function tokensDaConversa(messages) {
  let n = TOKENS_RESPOSTA;
  for (const m of messages) n += TOKENS_POR_MENSAGEM + enc.encode(m.role).length + enc.encode(m.content ?? '').length;
  return n;
}

export const tokensDoTexto = (t) => enc.encode(t).length;
