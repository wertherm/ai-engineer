// System design: assistente RAG corporativo para 10 mil funcionários. Todas as premissas ficam explícitas
// aqui em cima: numa entrevista, dizer a premissa em voz alta vale tanto quanto a conta.
import { estimar, armazenamento, custoIndexacao, PRECOS_ILUSTRATIVOS } from './capacidade.js';

export const PREMISSAS = {
  usuarios: 10_000,
  ativosDia: 0.3, //               30% usam num dia útil (premissa; valide com o cliente)
  requisicoesPorAtivo: 8,
  chamadasLLM: 1, //               RAG simples: 1 chamada de geração por pergunta
  tokensEntrada: 400 + 5 * 300 + 300 + 50, // sistema + 5 trechos de ~300 + histórico resumido + pergunta = 2250
  tokensSaida: 250,
  fracaoCacheada: 0.15, //         prefixo fixo (instruções) servido do cache de prompt
  horasUteis: 10,
  fatorPico: 3,
  latenciaS: 6,
  diasMes: 22,
};

const BASE = { documentos: 50_000, trechosPorDoc: 8, dimensoes: 1024, bytesTextoPorTrecho: 1500, tokensPorTrecho: 300 };

// Medido de verdade neste repo: vLLM 0.31.0 em CPU com Qwen2.5-0.5B (projeto final da trilha LLMOps).
const TOKENS_S_CPU_MEDIDO = 29.5;

const fmt = (n, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });

if (import.meta.url === `file://${process.argv[1]}`) {
  const e = estimar(PREMISSAS);
  const arm = armazenamento(BASE);
  console.log('== Volume e capacidade ==');
  console.log(`requisições/dia: ${fmt(e.reqDia)} · RPS médio ${fmt(e.rpsMedio, 2)} · RPS pico ${fmt(e.rpsPico, 2)}`);
  console.log(`concorrência no pico (Little): ${fmt(e.concorrenciaPico, 1)} requisições simultâneas`);
  console.log(`geração no pico: ${fmt(e.tokensSaidaPorSegundoPico)} tokens/s de saída`);
  console.log(`tokens/mês: ${fmt(e.tokensMes.entrada / 1e6)} M de entrada · ${fmt(e.tokensMes.saida / 1e6)} M de saída`);

  console.log('\n== Custo via API (preços ILUSTRATIVOS, US$/1M tokens: ' + JSON.stringify(PRECOS_ILUSTRATIVOS) + ') ==');
  console.log(`LLM: US$ ${fmt(e.custoMes)} /mês · US$ ${fmt(e.custoPorRequisicao, 4)} por pergunta`);
  console.log(`indexação completa (${fmt(arm.trechos)} trechos): US$ ${fmt(custoIndexacao({ trechos: arm.trechos, tokensPorTrecho: BASE.tokensPorTrecho }), 2)}`);

  console.log('\n== Armazenamento vetorial ==');
  console.log(`${fmt(arm.trechos)} vetores de ${BASE.dimensoes} dims: ${fmt(arm.gbVetores, 2)} GB (float32) + ${fmt(arm.gbTexto, 2)} GB de texto, antes do índice HNSW`);

  console.log('\n== Sensibilidade (o que mais mexe no custo?) ==');
  const cenarios = {
    'base': {},
    'cache de prompt 50%': { fracaoCacheada: 0.5 },
    '3 trechos em vez de 5': { tokensEntrada: 400 + 3 * 300 + 300 + 50 },
    'agente com 4 chamadas/pergunta': { chamadasLLM: 4 },
    'adoção dobra (60% ativos)': { ativosDia: 0.6 },
  };
  for (const [nome, delta] of Object.entries(cenarios)) {
    const c = estimar({ ...PREMISSAS, ...delta });
    console.log(`${nome.padEnd(32)} US$ ${fmt(c.custoMes).padStart(6)} /mês · pico ${fmt(c.tokensSaidaPorSegundoPico).padStart(5)} tok/s`);
  }

  console.log('\n== Self-host: quantas réplicas do servidor medido neste repo? ==');
  console.log(`no pico: ${fmt(e.tokensSaidaPorSegundoPico)} tok/s ÷ ${TOKENS_S_CPU_MEDIDO} tok/s (vLLM CPU, modelo 0,5B) = ${Math.ceil(e.tokensSaidaPorSegundoPico / TOKENS_S_CPU_MEDIDO)} réplicas`);
  console.log('-> CPU não fecha a conta e um modelo de 0,5B não tem a qualidade necessária: API ou GPU (meça o tok/s da sua GPU).');
}
