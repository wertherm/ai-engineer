// Dois cenários: orçamento folgado (termina) e apertado (o guardrail corta antes da 2ª chamada).
import assert from 'node:assert/strict';
import { executarAgente } from './agente.js';

const tarefa = 'Quanto custam 3 monitores?';

console.log('== orçamento folgado ==');
const ok = await executarAgente(tarefa);
console.log('resultado:', ok);
assert.equal(ok.motivo, 'ok');
assert.match(ok.resposta.replace(/\./g, ''), /2700/);

console.log('\n== orçamento apertado (1 chamada) ==');
const corte = await executarAgente(tarefa, { orcamento: { chamadas: 1, tokens: 3000 } });
console.log('resultado:', corte);
assert.equal(corte.motivo, 'orcamento');
console.log('\n✅ tool nova usada e guardrail de orçamento funcionando');
