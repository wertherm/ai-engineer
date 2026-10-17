// Audita READMEs de pastas reais deste repositório (ou as que você passar na linha de comando).
// Uso: node exemplos/01-auditoria-de-readme/auditar.js [pasta ...]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditarTexto } from './checklist.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const raizRepo = resolve(aqui, '../../../..');

// Padrão: três projetos reais do repo (um projeto final, um exemplo de produção e um módulo) + um README fraco.
const padrao = [
  'trilhas-extras/llmops-vllm-openshift/projeto-final',
  'modulos/03-mcp/exemplos/04-mcp-http-producao',
  'trilhas-extras/mlops/exemplos/04-drift-e-monitoramento',
  'modulos/12-carreira/exemplos/01-auditoria-de-readme/fixtures/projeto-fraco',
].map((p) => join(raizRepo, p));

const pastas = process.argv.length > 2 ? process.argv.slice(2).map((p) => resolve(p)) : padrao;
let falhas = 0;

for (const pasta of pastas) {
  const arq = join(pasta, 'README.md');
  if (!existsSync(arq)) {
    console.log(`\n✗ ${relative(raizRepo, pasta)}: sem README.md (isso já reprova)`);
    falhas++;
    continue;
  }
  const { nota, passou, resultados, faltandoObrigatorio } = auditarTexto(readFileSync(arq, 'utf8'), readdirSync(pasta));
  if (!passou) falhas++;
  console.log(`\n${passou ? '✓' : '✗'} ${relative(raizRepo, pasta)} · nota ${nota}% · ${passou ? 'PASSA' : 'NÃO PASSA'}`);
  for (const r of resultados) console.log(`   ${r.ok ? '[x]' : '[ ]'} ${r.id.padEnd(15)} ${r.obrigatorio ? '*' : ' '} ${r.ok ? '' : r.descricao}`);
  if (faltandoObrigatorio.length) console.log(`   faltando (obrigatório): ${faltandoObrigatorio.join(', ')}`);
}

console.log(`\n${pastas.length - falhas}/${pastas.length} READMEs passam no checklist (* = obrigatório).`);
