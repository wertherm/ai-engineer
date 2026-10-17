// Solução do exercício 02: triagem de tickets com IA. Cada etapa tem perfil de tokens diferente, então
// estimamos por etapa (reaproveitando o exemplo 05) e somamos. Preços ILUSTRATIVOS (ver capacidade.js).
import { estimar } from '../../../exemplos/05-system-design-rag/capacidade.js';

// Premissas do enunciado: 400 atendentes × 60 tickets/dia, 8 h de operação, pico 2,5× a média, 22 dias/mês.
const comum = { usuarios: 400, ativosDia: 1, requisicoesPorAtivo: 60, horasUteis: 8, fatorPico: 2.5, diasMes: 22 };

export const ETAPAS = {
  // 1) Classificação (categoria + prioridade) em JSON: prompt curto, saída minúscula.
  classificar: { ...comum, chamadasLLM: 1, tokensEntrada: 600, tokensSaida: 30, fracaoCacheada: 0.5, latenciaS: 1.5 },
  // 2) Sugestão de resposta com RAG na base de conhecimento (4 trechos de ~300 tokens).
  sugerir: { ...comum, chamadasLLM: 1, tokensEntrada: 500 + 4 * 300 + 400, tokensSaida: 300, fracaoCacheada: 0.2, latenciaS: 6 },
  // 3) Agente que consulta o status do pedido via tool (MCP) em 30% dos tickets: 2 chamadas extras.
  //    Modelamos como 30% dos tickets: requisicoesPorAtivo × 0,3.
  agente: { ...comum, requisicoesPorAtivo: 60 * 0.3, chamadasLLM: 2, tokensEntrada: 1500, tokensSaida: 120, fracaoCacheada: 0.3, latenciaS: 8 },
};

export function total() {
  const porEtapa = Object.fromEntries(Object.entries(ETAPAS).map(([k, p]) => [k, estimar(p)]));
  const soma = (f) => Object.values(porEtapa).reduce((s, e) => s + f(e), 0);
  return {
    porEtapa,
    custoMes: soma((e) => e.custoMes),
    tokSPico: soma((e) => e.tokensSaidaPorSegundoPico),
    ticketsMes: 400 * 60 * 22,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t = total();
  const fmt = (n, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
  console.log('etapa         RPS pico  concorr.  tok/s saída  US$/mês');
  for (const [k, e] of Object.entries(t.porEtapa)) {
    console.log(`${k.padEnd(13)} ${fmt(e.rpsPico, 2).padStart(8)}  ${fmt(e.concorrenciaPico, 1).padStart(8)}  ${fmt(e.tokensSaidaPorSegundoPico).padStart(11)}  ${fmt(e.custoMes).padStart(7)}`);
  }
  console.log(`\nTOTAL: US$ ${fmt(t.custoMes)} /mês · US$ ${fmt(t.custoMes / t.ticketsMes, 4)} por ticket · ${fmt(t.tokSPico)} tok/s de saída no pico`);
  const maior = Object.entries(t.porEtapa).sort((a, b) => b[1].custoMes - a[1].custoMes)[0][0];
  console.log(`Maior custo: "${maior}" -> é onde otimizar primeiro (menos trechos, cache, modelo menor se a avaliação deixar).`);
}
