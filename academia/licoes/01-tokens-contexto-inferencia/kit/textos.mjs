// Textos fixos do laboratório da Lição 1. Use-os como estão: o verificador compara os seus números com eles.
// O texto em inglês é a tradução fiel do texto em português (mesmo conteúdo, idioma diferente).

export const TEXTO_PT =
  'Um modelo de linguagem não lê palavras: ele lê tokens, pedaços de texto que podem ser uma palavra inteira, ' +
  'parte dela ou apenas um sinal de pontuação. Cada chamada à API é independente, então a conversa inteira ' +
  'precisa ser enviada de novo a cada pergunta. O custo e o limite de contexto são contados em tokens, não em ' +
  'caracteres nem em palavras. Por isso, medir é melhor do que adivinhar.';

export const TEXTO_EN =
  'A language model does not read words: it reads tokens, pieces of text that may be a whole word, part of ' +
  'one, or just a punctuation mark. Every API call is independent, so the entire conversation must be sent ' +
  'again with each question. Cost and context limits are counted in tokens, not in characters or words. ' +
  'That is why measuring is better than guessing.';

// Quantas vezes repetir o TEXTO_PT para medir o crescimento do prompt.
export const REPETICOES = [1, 2, 4, 8];

// Experimento "sem memória".
export const FATO = 'Zephyrus-42';
export const MSG_FATO = `Meu codinome é ${FATO}. Responda apenas "anotado".`;
export const MSG_PERGUNTA = 'Qual é o meu codinome? Responda só com o codinome.';

// Experimento "decodificação": pedido longo, cortado por max_tokens em duas medidas diferentes.
export const PEDIDO_LONGO =
  'Escreva uma lista numerada com 40 dicas curtas para quem está aprendendo a programar.';
export const MAX_TOKENS_CURTO = 16;
export const MAX_TOKENS_LONGO = 96;

// Experimento "truncamento".
export const PEDIDO_TRUNCAMENTO = 'Explique, em pelo menos três parágrafos, o que é uma janela de contexto.';
export const MAX_TOKENS_TRUNCAMENTO = 5;

// Limite de saída usado nas medições de entrada (só interessa o prompt_tokens).
export const MAX_TOKENS_MEDICAO = 8;
