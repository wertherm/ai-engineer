// Exemplo 04 · Padrões de RAG medidos: Basic × Hybrid Search (RRF) × Multi-Index, com recall@k.
import { criarPool, embed, vetor, tabela } from '../../comum/llm.js';
import { INDICES, PERGUNTAS, indexar, comInstrucao } from './corpus.js';
import { buscaVetorial, buscaHibrida, buscaMultiIndiceFederada, criarBuscaMultiIndice } from './buscas.js';

const pool = await criarPool();
await indexar(pool);

const embsPerguntas = (await embed(PERGUNTAS.map((p) => comInstrucao(p.q)))).map(vetor);
const embsIndices = await embed(Object.values(INDICES).map(comInstrucao));
const ESTRATEGIAS = {
  basic: buscaVetorial,
  hybrid: buscaHibrida,
  'multi-index federado': buscaMultiIndiceFederada,
  'multi-index roteado': criarBuscaMultiIndice(Object.fromEntries(Object.keys(INDICES).map((n, i) => [n, embsIndices[i]]))),
};

const linhas = [];
for (const [nome, buscar] of Object.entries(ESTRATEGIAS)) {
  let hit1 = 0, hit3 = 0, ms = 0;
  const erros = [];
  for (const [i, p] of PERGUNTAS.entries()) {
    const t0 = performance.now();
    const ids = await buscar(pool, p.q, embsPerguntas[i], 3);
    ms += performance.now() - t0;
    if (ids[0] === p.gabarito) hit1++;
    if (ids.includes(p.gabarito)) hit3++;
    if (ids[0] !== p.gabarito) erros.push(`${p.gabarito}→${ids[0]}`);
  }
  const n = PERGUNTAS.length;
  linhas.push({ estrategia: nome, 'recall@1': `${hit1}/${n}`, 'recall@3': `${hit3}/${n}`, 'ms/consulta': (ms / n).toFixed(1), 'erros no top-1 (gabarito→veio)': erros.join(' ') || '-' });
}
console.log(tabela(linhas));
await pool.end();
