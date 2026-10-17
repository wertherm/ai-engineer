// Solução do exercício 01: roda o checklist do exemplo 01 no README fraco e no reescrito e mostra o antes/depois.
import { readFileSync } from 'node:fs';
import { auditarTexto } from '../../../exemplos/01-auditoria-de-readme/checklist.js';

const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const antes = auditarTexto(ler('../readme-fraco.md'));
const depois = auditarTexto(ler('./README-reescrito.md'));

console.log('critério          antes  depois');
for (const [i, c] of antes.resultados.entries()) {
  console.log(`${c.id.padEnd(17)} ${c.ok ? ' [x] ' : ' [ ] '}  ${depois.resultados[i].ok ? '[x]' : '[ ]'}`);
}
console.log(`\nnota: ${antes.nota}% -> ${depois.nota}% · ${depois.passou ? 'PASSA' : 'NÃO PASSA'}`);
// Os números do README reescrito vieram da execução real do projeto final da trilha LLMOps
// (trilhas-extras/llmops-vllm-openshift/projeto-final/relatorio.md): nada inventado.
process.exitCode = depois.passou ? 0 : 1;
