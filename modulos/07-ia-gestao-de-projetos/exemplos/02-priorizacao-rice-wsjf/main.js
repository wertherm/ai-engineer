// Priorização inteligente: o código calcula RICE/WSJF/MoSCoW/roadmap; o LLM só escreve a justificativa.
import { readFileSync } from 'node:fs';
import { gerarTexto } from '../../lib/llm.js';
import { rice, wsjf, moscow, roadmap, alinhamentoOkr } from './priorizar.js';

const dados = JSON.parse(readFileSync(new URL('./backlog.json', import.meta.url), 'utf8'));
const { itens, okrs, capacidadePorSprint } = dados;

const classes = moscow(itens);
const tabela = itens
  .map((i) => ({ id: i.id, titulo: i.titulo, RICE: Math.round(rice(i)), WSJF: +wsjf(i).toFixed(1), MoSCoW: classes.get(i.id), KR: i.kr ?? '-' }))
  .sort((a, b) => b.WSJF - a.WSJF);
console.table(tabela);

const plano = roadmap(itens, capacidadePorSprint, classes);
plano.forEach((s, n) => console.log(`Sprint ${n + 1}: ${s.join(', ')}`));

const okr = alinhamentoOkr(okrs, itens);
console.log('\nEsforço por KR:', okr.porKr.map((k) => `${k.kr}=${k.esforcoPct}%`).join(' · '));
console.log('KRs sem iniciativa:', okr.krsSemIniciativa, '| Itens sem KR:', okr.itensSemKr);

// What-if: e se a confiança do chatbot (HU-04) subir para 0.9 depois de um protótipo?
const hipotese = itens.map((i) => (i.id === 'HU-04' ? { ...i, confidence: 0.9 } : i));
const antes = [...itens].sort((a, b) => rice(b) - rice(a)).map((i) => i.id);
const depois = [...hipotese].sort((a, b) => rice(b) - rice(a)).map((i) => i.id);
console.log(`\nWhat-if HU-04 confidence 0.4→0.9: ranking RICE ${antes.join('>')}  ⟶  ${depois.join('>')}`);

// O LLM recebe os NÚMEROS prontos e só redige. Se ele errar uma conta, a tabela acima é a fonte da verdade.
const top = tabela.slice(0, 3).map((t) => `${t.id} ${t.titulo}: WSJF ${t.WSJF}, RICE ${t.RICE}, ${t.MoSCoW}, KR ${t.KR}`).join('\n');
const justificativa = await gerarTexto({
  system: 'Você é um PM. Escreva em português, no máximo 3 frases, sem inventar números além dos fornecidos.',
  user: `Justifique para o comitê a ordem destes 3 itens do topo do backlog:\n${top}`,
  maxTokens: 160,
});
console.log('\nJustificativa (LLM):\n' + justificativa);
