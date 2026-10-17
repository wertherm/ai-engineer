// Teste sem LLM: a auditoria é código puro, então dá para testar com fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditarRequisitos } from './validar.js';

const base = {
  epicos: [{ id: 'EP-01', titulo: 'x', historias: [{
    id: 'HU-01', como: 'cliente', quero: 'a', para: 'b', tarefas: ['t1'],
    criterios: ['Dado X, quando Y, então Z', 'Dado A, quando B, então C'],
  }] }],
  mudancas: [{ descricao: 'bloquear vencidos', afeta: ['HU-01'] }],
  duvidas: [],
};

test('backlog bem formado não tem problemas', () => {
  assert.deepEqual(auditarRequisitos(base).problemas, []);
});

test('acusa critério fora do Dado/Quando/Então e mudança órfã', () => {
  const ruim = structuredClone(base);
  ruim.epicos[0].historias[0].criterios = ['funciona'];
  ruim.mudancas[0].afeta = ['HU-99'];
  const { problemas } = auditarRequisitos(ruim);
  assert.equal(problemas.length, 3);
});
