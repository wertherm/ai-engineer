// Testes do gerador de dados (node --test). Rodam em milissegundos, sem Ollama nem Postgres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRng, gerarCirculo, dividir } from './dados.js';

test('mesma semente gera os mesmos dados (reprodutibilidade)', () => {
  assert.deepEqual(gerarCirculo(50, criarRng(7)), gerarCirculo(50, criarRng(7)));
});

test('rótulo 1 só para pontos dentro do círculo', () => {
  const { xs, ys } = gerarCirculo(500, criarRng(1));
  xs.forEach(([x, y], i) => assert.equal(ys[i], x * x + y * y < 0.36 ? 1 : 0));
});

test('divisão 70/15/15 sem perder nem repetir exemplos', () => {
  const { treino, validacao, teste } = dividir(gerarCirculo(1000, criarRng(2)));
  assert.equal(treino.xs.length, 700);
  assert.equal(validacao.xs.length, 150);
  assert.equal(teste.xs.length, 150);
});
