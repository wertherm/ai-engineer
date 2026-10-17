// Uso: node main.js [pasta-do-projeto]  -> imprime o checklist, grava auditoria.json e sai com código 1 se algo falhar
// (assim dá para usar como etapa de CI: o pipeline para quando a governança não passa).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { auditar } from './checklist.js';

const pasta = resolve(process.argv[2] ?? new URL('../projeto-exemplo', import.meta.url).pathname);
const resultado = auditar(pasta);
const icone = { true: '✅', false: '❌', null: '⏭ ' };
console.log(`Auditoria de governança: ${pasta}\n`);
for (const r of resultado) console.log(`${icone[r.ok]} ${r.id} ${r.titulo}\n      ${r.evidencia}`);

const falhas = resultado.filter((r) => r.ok === false).length;
const relatorio = { pasta, auditadoEm: new Date().toISOString(), falhas, resultado };
writeFileSync(new URL('./auditoria.json', import.meta.url), JSON.stringify(relatorio, null, 2));
console.log(`\n${falhas} falha(s). Evidências em solucao/auditoria.json`);
process.exit(falhas ? 1 : 0);
