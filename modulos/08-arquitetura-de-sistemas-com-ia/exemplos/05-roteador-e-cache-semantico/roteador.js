// Model Router por intenção/complexidade + definição dos tiers (Model Tiering).
// Regra de ouro: o roteador tem de ser MUITO mais barato que a diferença de preço entre os tiers;
// por isso aqui ele é uma heurística determinística (microssegundos, custo zero).

export const TIERS = {
  // Localmente é o mesmo modelo; num provedor real, troque "modelo" por um mini × um flagship.
  barato: { maxTokens: 40, sistema: 'Você é um assistente financeiro. Responda em UMA frase curta, em português.' },
  caro: { maxTokens: 120, sistema: 'Você é um consultor financeiro sênior. Responda em português, em até 4 tópicos curtos.' },
};

const SINAIS_COMPLEXIDADE = /\b(compar|diferen[cç]a|prós|contras|vantage|estrat[eé]gi|analis|por que|devo)/i;

/** Devolve { tier, motivo }. Intent-Based Routing: a intenção (comparar/analisar × definir) decide o tier. */
export function rotear(pergunta) {
  if (SINAIS_COMPLEXIDADE.test(pergunta)) return { tier: 'caro', motivo: 'intenção analítica' };
  if (pergunta.split(/\s+/).length > 25) return { tier: 'caro', motivo: 'pergunta longa' };
  return { tier: 'barato', motivo: 'pergunta factual curta' };
}
