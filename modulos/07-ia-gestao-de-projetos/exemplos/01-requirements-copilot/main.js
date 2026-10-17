// Requirements Copilot: texto livre -> épicos, histórias, critérios de aceite e mudanças (JSON validado).
// O LLM PROPÕE; o zod garante o formato e validar.js audita a qualidade.
import { readFileSync, writeFileSync } from 'node:fs';
import { extrairJson } from '../../lib/llm.js';
import { Requisitos } from './schema.js';
import { auditarRequisitos } from './validar.js';

const pedido = readFileSync(new URL('./pedido.txt', import.meta.url), 'utf8');

const system = `Você é um analista de requisitos. Converta o pedido em backlog.
Regras: no máximo 2 épicos e 3 histórias no total; ids EP-01.. e HU-01..;
cada história com 2 critérios no formato "Dado ..., quando ..., então ..." e até 3 tarefas;
registre em "mudancas" as alterações de escopo pedidas e em "duvidas" o que estiver ambíguo. Português.`;

console.time('LLM');
const req = await extrairJson({ schema: Requisitos, nome: 'requisitos', system, user: pedido, maxTokens: 1200 });
console.timeEnd('LLM');

for (const ep of req.epicos) {
  console.log(`\n${ep.id} · ${ep.titulo}`);
  for (const h of ep.historias) {
    console.log(`  ${h.id} Como ${h.como}, quero ${h.quero}, para ${h.para}`);
    h.criterios.forEach((c) => console.log(`     ✔ ${c}`));
    console.log(`     tarefas: ${h.tarefas.join(' | ')}`);
  }
}
console.log('\nMudanças:', req.mudancas.map((m) => `${m.descricao} -> ${m.afeta.join(',')}`));
console.log('Dúvidas para o PO:', req.duvidas);

const auditoria = auditarRequisitos(req);
console.log(`\nAuditoria determinística: ${auditoria.historias} histórias, ${auditoria.problemas.length} problema(s)`);
auditoria.problemas.forEach((p) => console.log('  ⚠', p));

writeFileSync(new URL('./backlog.gerado.json', import.meta.url), JSON.stringify(req, null, 2));
console.log('\nSalvo em exemplos/01-requirements-copilot/backlog.gerado.json');
