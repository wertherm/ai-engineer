import { test } from 'node:test';
import assert from 'node:assert/strict';
import { total } from './estimativa.js';

test('total soma as etapas e a sugestão com RAG é a mais cara', () => {
  const t = total();
  const soma = Object.values(t.porEtapa).reduce((s, e) => s + e.custoMes, 0);
  assert.ok(Math.abs(t.custoMes - soma) < 1e-9);
  const maior = Object.entries(t.porEtapa).sort((a, b) => b[1].custoMes - a[1].custoMes)[0][0];
  assert.equal(maior, 'sugerir');
});
