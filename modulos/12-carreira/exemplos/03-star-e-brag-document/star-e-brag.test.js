import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarStar } from './validar-star.js';
import { montarCaso, variacao } from './caso-de-promocao.js';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

test('história boa passa e a fraca falha', () => {
  const [boa, fraca] = json('./historias.json');
  assert.equal(validarStar(boa).ok, true);
  assert.equal(validarStar(fraca).ok, false);
  assert.equal(validarStar(fraca).checagens['ação na 1ª pessoa do singular'], false);
});

test('caso de promoção calcula variação e acha lacunas', () => {
  assert.equal(variacao({ antes: 45, depois: 8 }), '45 → 8 (-82%)');
  assert.deepEqual(montarCaso(json('./brag.json')).lacunas, ['execucao']);
});
