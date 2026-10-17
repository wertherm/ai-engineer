// Exemplo 05 · Model Router + Model Tiering + Semantic Cache + Response Streaming, com relatório de custo/latência.
import { criarPool, chat, chatStream, custoUSD, precos, tabela } from '../../comum/llm.js';
import { rotear, TIERS } from './roteador.js';
import { CacheSemantico } from './cache.js';

const PEDIDOS = [
  'O que é CDI?',
  'Compare antecipação de recebíveis e empréstimo com CCB para um lojista, com prós e contras.',
  'o que significa CDI?',
  'Me explique rapidinho o que é o CDI',
  'O que é CDB?', // parecido com "CDI" no texto, mas é OUTRA pergunta: o limiar precisa barrar
  'Compare a antecipação de recebíveis com um empréstimo via CCB para lojistas: prós e contras',
];

const pool = await criarPool();
const cache = new CacheSemantico(pool, { limiar: Number(process.env.LIMIAR ?? 0.9) });
await cache.iniciar();

const linhas = [];
let custoReal = 0, custoSemOtimizacao = 0;
for (const pergunta of PEDIDOS) {
  const t0 = performance.now();
  const c = await cache.buscar(pergunta);
  if (c.hit) {
    const ms = Math.round(performance.now() - t0);
    // Contrafactual: quanto teria custado gerar de novo no tier caro (o que um sistema sem roteador faria).
    custoSemOtimizacao += custoUSD('caro', { prompt_tokens: c.vizinho.prompt_tokens, completion_tokens: c.vizinho.completion_tokens });
    linhas.push({ pergunta: pergunta.slice(0, 38), rota: `cache (${c.vizinho.tier})`, sim: c.sim.toFixed(3), ms, ttft: ms, tokens: 0, 'US$': '0' });
    continue;
  }
  const { tier, motivo } = rotear(pergunta);
  const msgs = [{ role: 'system', content: TIERS[tier].sistema }, { role: 'user', content: pergunta }];
  let r;
  if (tier === 'caro') {
    // Response Streaming: a resposta longa começa a aparecer no TTFT, não no fim. O custo é o mesmo;
    // muda a latência PERCEBIDA.
    process.stdout.write(`\n[stream ${tier}] `);
    r = await chatStream(msgs, { maxTokens: TIERS[tier].maxTokens, onToken: (t) => process.stdout.write(t) });
    process.stdout.write('\n');
  } else {
    r = await chat(msgs, { maxTokens: TIERS[tier].maxTokens });
    r.ttft = r.ms; // sem streaming, o usuário só vê algo no fim
    console.log(`\n[${tier}] ${r.texto}`);
  }
  await cache.gravar(pergunta, c.emb, r.texto, tier, r.usage);
  const usd = custoUSD(tier, r.usage);
  custoReal += usd;
  custoSemOtimizacao += custoUSD('caro', r.usage);
  const cached = r.usage?.prompt_tokens_details?.cached_tokens;
  linhas.push({
    pergunta: pergunta.slice(0, 38), rota: `${tier} (${motivo})`, sim: c.sim.toFixed(3),
    ms: Math.round(performance.now() - t0), ttft: r.ttft,
    tokens: `${r.usage?.prompt_tokens}+${r.usage?.completion_tokens}${cached ? ` (${cached} em prompt cache)` : ''}`,
    'US$': usd.toFixed(6),
  });
}

console.log('\n' + tabela(linhas));
console.log(`\nPreços de tabela (US$/1M tokens in/out): ${JSON.stringify(precos)}`);
console.log(`Custo real (roteador + cache):        US$ ${custoReal.toFixed(6)}`);
console.log(`Custo sem otimização (tudo no caro):  US$ ${custoSemOtimizacao.toFixed(6)}`);
console.log(`Economia: ${(100 * (1 - custoReal / custoSemOtimizacao)).toFixed(0)}%`);
await pool.end();
