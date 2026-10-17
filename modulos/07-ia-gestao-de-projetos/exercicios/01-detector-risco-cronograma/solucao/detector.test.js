import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectarRiscos, zRobusto, inclinacao } from './detector.js';

const hist = JSON.parse(readFileSync(new URL('./historico-sprints.json', import.meta.url), 'utf8'));

test('z robusto ignora outlier antigo', () => {
  assert.ok(Math.abs(zRobusto(10, [10, 10, 11, 9, 100])) < 1);
});

test('inclinação de reta', () => {
  assert.equal(inclinacao([1, 2, 3, 4]), 1);
});

test('sprint 12 tem riscos de escopo, cronograma e recursos', () => {
  const tipos = detectarRiscos(hist).map((r) => r.tipo);
  for (const t of ['escopo', 'cronograma', 'recursos']) assert.ok(tipos.includes(t), t);
});

test('sprint saudável não gera falso positivo', () => {
  assert.equal(detectarRiscos(hist.slice(0, 6)).length, 0);
});
