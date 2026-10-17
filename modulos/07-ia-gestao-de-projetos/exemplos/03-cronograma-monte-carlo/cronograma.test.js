import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpm, monteCarloThroughput, ordemTopologica, triangular, mulberry32 } from './cronograma.js';

const tarefas = [
  { id: 'A', provavel: 3, dependeDe: [] },
  { id: 'B', provavel: 2, dependeDe: [] },
  { id: 'C', provavel: 4, dependeDe: ['A', 'B'] },
];

test('CPM acha o caminho crítico e a folga', () => {
  const r = cpm(tarefas);
  assert.equal(r.fim, 7);
  assert.deepEqual(r.critico, ['A', 'C']);
  assert.equal(r.tarefas.B.folga, 1);
});

test('ciclo de dependência é erro', () => {
  assert.throws(() => ordemTopologica([{ id: 'X', dependeDe: ['Y'] }, { id: 'Y', dependeDe: ['X'] }]), /Ciclo/);
});

test('triangular fica dentro do intervalo', () => {
  const r = mulberry32(1);
  for (let i = 0; i < 1000; i++) { const v = triangular(r, 2, 3, 8); assert.ok(v >= 2 && v <= 8); }
});

test('throughput constante dá previsão exata', () => {
  assert.deepEqual(monteCarloThroughput([5], 20), { p50: 4, p85: 4, p95: 4 });
});
