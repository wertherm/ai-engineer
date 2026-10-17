import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cobertura, avaliarHeadline } from './analisar.js';

test('cobertura conta só termos que a vaga pede', () => {
  const c = cobertura('Faço RAG com pgvector', 'Procuramos RAG, pgvector e Kubernetes');
  assert.deepEqual(c.presentes, ['RAG', 'Banco vetorial']);
  assert.deepEqual(c.ausentes, ['Kubernetes']);
  assert.equal(c.pct, 67);
});

test('headline: cargo precisa aparecer nos primeiros 60 caracteres', () => {
  const longe = 'Apaixonado por tecnologia, café, inovação e trabalho em equipe | Engenheiro de IA';
  assert.equal(avaliarHeadline(longe).cargoVisivel, false);
  assert.equal(avaliarHeadline('Engenheiro de IA Aplicada | RAG').cargoVisivel, true);
});
