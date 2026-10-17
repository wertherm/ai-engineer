import { test } from 'node:test';
import assert from 'node:assert/strict';
import { banco, sortear, avaliarOffline } from './simulador.js';

test('banco tem ids únicos e regex válidas', () => {
  assert.equal(new Set(banco.map((p) => p.id)).size, banco.length);
  for (const p of banco) for (const k of p.pontosChave) assert.doesNotThrow(() => new RegExp(k.padrao, 'i'));
});

test('mesma seed sorteia as mesmas perguntas', () => {
  assert.deepEqual(sortear(3, 12).map((p) => p.id), sortear(3, 12).map((p) => p.id));
});

test('a resposta-modelo cobre todos os seus pontos-chave', () => {
  for (const p of banco) assert.equal(avaliarOffline(p, p.respostaModelo).pct, 100, p.id);
});
