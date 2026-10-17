import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotear, tierIdeal } from './roteador.js';

const COMPLEXA = 'Compare CCB e antecipação com prós e contras';

test('classifica os três tiers pela intenção', () => {
  assert.equal(tierIdeal('Qual a taxa?'), 'barato');
  assert.equal(tierIdeal('Explique como funciona o CDI'), 'medio');
  assert.equal(tierIdeal(COMPLEXA), 'caro');
});
test('abaixo do alerta usa o tier ideal', () => {
  assert.equal(rotear(COMPLEXA, { gastoMesUSD: 1 }).tier, 'caro');
});
test('entre 80% e 100% desce um degrau', () => {
  assert.equal(rotear(COMPLEXA, { gastoMesUSD: 4.5 }).tier, 'medio');
  assert.equal(rotear('Qual a taxa?', { gastoMesUSD: 4.5 }).tier, 'barato');
});
test('orçamento esgotado recusa', () => {
  assert.deepEqual(rotear('Qual a taxa?', { gastoMesUSD: 5 }), { tier: null, motivo: 'orçamento esgotado' });
});
