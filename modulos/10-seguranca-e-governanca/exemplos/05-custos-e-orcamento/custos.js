// Calculadora de custo total de uma feature de IA: API x self-hosting, com cache, retentativas e guardrails.
// Uso: node exemplos/05-custos-e-orcamento/custos.js [premissas.json]
import { readFileSync } from 'node:fs';

const arquivo = process.argv[2] ?? new URL('./premissas.json', import.meta.url);
const p = JSON.parse(readFileSync(arquivo, 'utf8'));

/** Custo mensal via API, separado por componente (o que não se mede não se otimiza). */
export function custoApi({ uso, guardrails, api }) {
  const req = uso.requisicoes_por_dia * uso.dias_por_mes * (1 + uso.taxa_retentativa);
  const M = 1e6;
  const entradaCache = req * uso.tokens_entrada_por_req * uso.fracao_entrada_em_cache;
  const entradaCheia = req * uso.tokens_entrada_por_req - entradaCache;
  const componentes = {
    'entrada (sem cache)': (entradaCheia / M) * api.usd_por_milhao_entrada,
    'entrada (cache)': (entradaCache / M) * api.usd_por_milhao_entrada_cache,
    saida: ((req * uso.tokens_saida_por_req) / M) * api.usd_por_milhao_saida,
    guardrails: guardrails.chamada_classificador_por_req
      ? ((req * guardrails.tokens_entrada_classificador) / M) * api.usd_por_milhao_entrada_classificador +
        ((req * guardrails.tokens_saida_classificador) / M) * api.usd_por_milhao_saida_classificador
      : 0,
  };
  const total = Object.values(componentes).reduce((a, b) => a + b, 0);
  return { req, componentes, total };
}

/** Self-hosting: paga a GPU ligada, use ou não. A capacidade limita o volume. */
export function custoSelfHosting({ uso, self_hosting: s }) {
  const total = s.gpus * s.usd_por_gpu_hora * s.horas_por_mes + s.custo_fixo_mensal_usd;
  const capacidadeSaida = s.gpus * s.tokens_saida_por_segundo_por_gpu * 3600 * s.horas_por_mes;
  const demandaSaida = uso.requisicoes_por_dia * uso.dias_por_mes * (1 + uso.taxa_retentativa) * uso.tokens_saida_por_req;
  return { total, utilizacao: demandaSaida / capacidadeSaida };
}

const fmt = (usd) => `US$ ${usd.toFixed(2).padStart(10)}  (R$ ${(usd * p.cambio_brl_por_usd).toFixed(0)})`;

const api = custoApi(p);
const self = custoSelfHosting(p);
console.log(`Feature: ${p.feature} · ${Math.round(api.req).toLocaleString('pt-BR')} chamadas/mês (com retentativas)`);
console.log('\nAPI (pago por token):');
for (const [k, v] of Object.entries(api.componentes)) console.log(`  ${k.padEnd(20)} ${fmt(v)}`);
console.log(`  ${'TOTAL'.padEnd(20)} ${fmt(api.total)}   -> ${((api.total / api.req) * 1000).toFixed(3)} US$/mil chamadas`);

const semCache = custoApi({ ...p, uso: { ...p.uso, fracao_entrada_em_cache: 0 } });
console.log(`  (sem cache seria ${fmt(semCache.total)}: o cache economiza ${(100 * (1 - api.total / semCache.total)).toFixed(0)}%)`);

console.log('\nSelf-hosting (pago por hora de GPU):');
console.log(`  ${'TOTAL'.padEnd(20)} ${fmt(self.total)}   utilização da capacidade: ${(100 * self.utilizacao).toFixed(1)}%`);

// Ponto de equilíbrio: a partir de quantas chamadas/dia o self-hosting fica mais barato?
// (custo da API cresce linear com o volume; o do self-hosting é ~fixo até lotar as GPUs)
const custoPorReqApi = api.total / (p.uso.requisicoes_por_dia * p.uso.dias_por_mes);
const equilibrio = self.total / p.uso.dias_por_mes / custoPorReqApi;
console.log(`\nPonto de equilíbrio: ~${Math.round(equilibrio).toLocaleString('pt-BR')} chamadas/dia ` +
  `(${(equilibrio / p.uso.requisicoes_por_dia).toFixed(1)}x o volume atual).`);
console.log(api.total < self.total ? 'Hoje: API sai mais barato.' : 'Hoje: self-hosting sai mais barato.');
