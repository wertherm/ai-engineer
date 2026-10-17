import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditar } from './checklist.js';

const pasta = new URL('../projeto-exemplo', import.meta.url).pathname;

test('projeto-exemplo falha exatamente nos itens plantados', () => {
  const falhas = auditar(pasta).filter((r) => r.ok === false).map((r) => r.id);
  assert.deepEqual(falhas, ['GOV-02', 'GOV-03', 'GOV-04', 'GOV-05', 'GOV-06']);
});
