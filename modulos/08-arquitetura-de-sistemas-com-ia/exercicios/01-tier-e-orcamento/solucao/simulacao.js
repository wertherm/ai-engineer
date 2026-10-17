// Simula um mês de tráfego (sem LLM: tokens estimados) e compara três políticas de roteamento.
// Determinístico (gerador pseudoaleatório com semente) para a saída ser reproduzível.
import { rotear, tierIdeal, custo, TIERS, POLITICA_PADRAO } from './roteador.js';

let semente = 42;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const MODELOS_DE_PERGUNTA = ['Qual a taxa hoje?', 'Explique como funciona a antecipação de recebíveis', 'Compare CCB e antecipação para minha loja com prós e contras'];
const pedidos = Array.from({ length: 30000 }, () => {
  const r = aleatorio();
  return MODELOS_DE_PERGUNTA[r < 0.6 ? 0 : r < 0.9 ? 1 : 2]; // 60% simples, 30% médias, 10% complexas
});
const tokensSaida = (tier) => Math.round(TIERS[tier].maxTokens * 0.8);

function rodar(nome, escolher) {
  let gasto = 0, recusados = 0;
  const porTier = { barato: 0, medio: 0, caro: 0 };
  for (const p of pedidos) {
    const tier = escolher(p, gasto);
    if (!tier) { recusados++; continue; }
    porTier[tier]++;
    gasto += custo(tier, 60, tokensSaida(tier));
  }
  return { politica: nome, gastoUSD: gasto.toFixed(2), recusados, ...porTier };
}

const resultados = [
  rodar('tudo no caro', () => 'caro'),
  rodar('só tier ideal', (p) => tierIdeal(p)),
  rodar('ideal + orçamento', (p, gasto) => rotear(p, { gastoMesUSD: gasto }).tier),
];
console.log(`Orçamento: US$ ${POLITICA_PADRAO.orcamentoMesUSD}/mês · alerta em ${POLITICA_PADRAO.alertaPct * 100}% · ${pedidos.length} pedidos`);
console.table(resultados);
