// Solução do exercício 01 · Roteador com 3 tiers + política de orçamento (Model Tiering + Policy-Driven Control).
// Parte do roteador do exemplo 04 e acrescenta: tier "medio" e degradação por orçamento mensal.

export const TIERS = {
  barato: { precoIn: 0.15, precoOut: 0.6, maxTokens: 40 },
  medio: { precoIn: 0.8, precoOut: 3.2, maxTokens: 80 },
  caro: { precoIn: 3, precoOut: 15, maxTokens: 120 },
};
const ORDEM = ['barato', 'medio', 'caro'];

export const POLITICA_PADRAO = { orcamentoMesUSD: 5, alertaPct: 0.8 };

/** Tier "ideal" pela intenção/complexidade, ignorando orçamento. */
export function tierIdeal(pergunta) {
  if (/\b(compar|estrat[eé]gi|analis|prós|contras|plano)/i.test(pergunta)) return 'caro';
  if (/\b(explique|como funciona|por que|diferen[cç]a)/i.test(pergunta) || pergunta.split(/\s+/).length > 15) return 'medio';
  return 'barato';
}

/**
 * Decide o tier considerando o orçamento:
 *  - gasto < alerta (80%)          -> tier ideal
 *  - alerta <= gasto < 100%        -> desce UM degrau (caro->medio, medio->barato); barato continua barato
 *  - gasto >= 100%                 -> recusa (o produto decide: fila, mensagem amigável, upgrade de plano)
 * Devolve { tier | null, motivo }.
 */
export function rotear(pergunta, { gastoMesUSD }, politica = POLITICA_PADRAO) {
  const ideal = tierIdeal(pergunta);
  const uso = gastoMesUSD / politica.orcamentoMesUSD;
  if (uso >= 1) return { tier: null, motivo: 'orçamento esgotado' };
  if (uso >= politica.alertaPct) {
    const rebaixado = ORDEM[Math.max(0, ORDEM.indexOf(ideal) - 1)];
    return { tier: rebaixado, motivo: rebaixado === ideal ? 'já no tier mínimo' : `rebaixado de ${ideal} (uso ${(uso * 100).toFixed(0)}%)` };
  }
  return { tier: ideal, motivo: 'tier ideal' };
}

export const custo = (tier, tokensIn, tokensOut) => (tokensIn * TIERS[tier].precoIn + tokensOut * TIERS[tier].precoOut) / 1e6;
