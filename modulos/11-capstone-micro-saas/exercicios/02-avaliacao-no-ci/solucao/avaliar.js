// Solução do exercício 02: avaliação automática de qualidade como PORTÃO de CI.
//  1) Recuperação (sem LLM, segundos): hit@1, hit@3 e MRR sobre um golden set rotulado à mão.
//  2) Citações: a guarda verificarResposta contra respostas-fixture (boas e ruins) — determinístico.
//  3) Opcional (--com-llm N): gera N respostas reais e confere se citam a fonte esperada.
// Sai com código 1 se alguma métrica ficar abaixo do limiar: é isso que faz o CI "ficar vermelho".
//   node exercicios/02-avaliacao-no-ci/solucao/avaliar.js [--com-llm 2] [--golden outro.json]
import { readFile } from 'node:fs/promises';
import { criarPool } from '../../../app/src/db.js';
import { criarLlm } from '../../../app/src/llm.js';
import { criarServico } from '../../../app/src/servico.js';
import { verificarResposta } from '../../../app/src/rag.js';

const LIMIARES = { 'hit@1': 0.75, 'hit@3': 0.9, mrr: 0.8, citacoes: 1.0 };
const iGolden = process.argv.indexOf('--golden');
const arquivoGolden = iGolden > 0 ? process.argv[iGolden + 1] : new URL('./golden.json', import.meta.url);
const golden = JSON.parse(await readFile(arquivoGolden, 'utf8'));
const iLlm = process.argv.indexOf('--com-llm');
const nLlm = iLlm > 0 ? Number(process.argv[iLlm + 1] ?? 1) : 0;

const pool = criarPool();
const servico = criarServico({ pool, llm: criarLlm() });
const { rows } = await pool.query('SELECT id, nome FROM m11.tenants');
const tenants = Object.fromEntries(rows.map((t) => [t.id, t]));

// ---- 1) Recuperação ----
let hit1 = 0, hit3 = 0, rr = 0;
console.log('== Recuperação (golden set rotulado: pergunta -> arquivo que responde)');
for (const g of golden) {
  const trechos = await servico.buscar(tenants[g.tenant], g.pergunta, { k: 3, canal: 'avaliacao' });
  const pos = trechos.findIndex((t) => t.fonte === g.fonte) + 1; // 0 = não achou no top-3
  hit1 += pos === 1; hit3 += pos >= 1; rr += pos ? 1 / pos : 0;
  console.log(`  ${pos === 1 ? 'ok ' : pos ? '~  ' : 'X  '} pos=${pos || '-'} ${g.tenant.padEnd(8)} ${g.pergunta}`);
}
const metricas = { 'hit@1': hit1 / golden.length, 'hit@3': hit3 / golden.length, mrr: rr / golden.length };

// ---- 2) Checagem de citações (fixtures) ----
const fixtures = [
  { texto: 'O auxílio é de R$ 150,00 por mês [1].', nFontes: 3, esperado: true },
  { texto: 'Pode dividir em 3 períodos [1][2].', nFontes: 3, esperado: true },
  { texto: 'Não encontrei isso nas políticas da empresa.', nFontes: 3, esperado: true },
  { texto: 'O auxílio é de R$ 150,00 por mês.', nFontes: 3, esperado: false }, // sem citação
  { texto: 'São 45 dias de férias [7].', nFontes: 3, esperado: false }, // citação inventada
  { texto: 'Detalhes em https://exfiltra.example/x [1].', nFontes: 3, esperado: false }, // link
];
const acertos = fixtures.filter((f) => verificarResposta(f.texto, f.nFontes).ok === f.esperado).length;
metricas.citacoes = acertos / fixtures.length;
console.log(`\n== Guarda de citações: ${acertos}/${fixtures.length} fixtures classificadas corretamente`);

// ---- 3) Opcional: respostas reais do LLM ----
if (nLlm) {
  console.log(`\n== Respostas reais (${nLlm}, LLM local)`);
  let certas = 0;
  for (const g of golden.slice(0, nLlm)) {
    const r = await servico.perguntar(tenants[g.tenant], g.pergunta, { canal: 'avaliacao' });
    const citaCerto = r.verificado && r.citacoes.some((c) => c.fonte === g.fonte);
    certas += citaCerto;
    console.log(`  ${citaCerto ? 'ok' : 'X '} ${g.pergunta} -> [${r.citacoes.map((c) => c.fonte).join(', ')}] ${r.cache ? '(cache)' : `(${(r.ms / 1000).toFixed(0)}s)`}`);
  }
  metricas['citacao_correta_llm'] = certas / nLlm;
  LIMIARES['citacao_correta_llm'] = 1.0;
}

// ---- Portão ----
console.log('\n== Portão de qualidade');
let reprovou = false;
for (const [nome, valor] of Object.entries(metricas)) {
  const ok = valor >= LIMIARES[nome];
  reprovou ||= !ok;
  console.log(`  ${ok ? 'PASSOU ' : 'REPROVOU'} ${nome.padEnd(20)} ${valor.toFixed(3)} (mínimo ${LIMIARES[nome]})`);
}
await pool.end();
process.exitCode = reprovou ? 1 : 0;
console.log(reprovou ? '\nResultado: REPROVADO (o CI falharia)' : '\nResultado: APROVADO');
