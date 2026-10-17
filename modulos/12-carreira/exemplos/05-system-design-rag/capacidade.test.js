import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimar, armazenamento } from './capacidade.js';
import { PREMISSAS } from './main.js';

test('volume e pico do cenário base', () => {
  const e = estimar(PREMISSAS);
  assert.equal(e.reqDia, 24_000);
  assert.ok(Math.abs(e.rpsPico - 2) < 1e-9); // 24.000 / 36.000 s × 3
  assert.ok(Math.abs(e.concorrenciaPico - 12) < 1e-9); // 2 req/s × 6 s
  assert.equal(e.tokensSaidaPorSegundoPico, 500);
});

test('custo sobe linearmente com chamadas ao LLM', () => {
  const um = estimar(PREMISSAS).custoMes;
  const quatro = estimar({ ...PREMISSAS, chamadasLLM: 4 }).custoMes;
  assert.ok(Math.abs(quatro - 4 * um) < 1e-6);
});

test('armazenamento: 1 milhão de vetores de 1024 dims ≈ 4,1 GB em float32', () => {
  const a = armazenamento({ documentos: 1_000_000, trechosPorDoc: 1, dimensoes: 1024, bytesTextoPorTrecho: 0 });
  assert.ok(Math.abs(a.gbVetores - 4.096) < 1e-9);
});
