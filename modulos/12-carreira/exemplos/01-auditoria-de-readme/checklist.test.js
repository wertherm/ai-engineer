import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditarTexto } from './checklist.js';

const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('README fraco não passa e acusa os 5 obrigatórios', () => {
  const r = auditarTexto(ler('./fixtures/projeto-fraco/README.md'));
  assert.equal(r.passou, false);
  assert.deepEqual(r.faltandoObrigatorio, ['proposito', 'como-rodar', 'saida-real', 'metricas', 'limitacoes']);
});

test('README reescrito do exercício 01 passa', () => {
  const r = auditarTexto(ler('../../exercicios/01-readme-que-passa/solucao/README-reescrito.md'));
  assert.equal(r.passou, true, `faltando: ${r.faltandoObrigatorio}`);
});

test('métricas exigem número COM unidade', () => {
  const semUnidade = auditarTexto('# x\n\nTemos 3 coisas, 4 itens e 5 casos.');
  const comUnidade = auditarTexto('# x\n\np95 de 1800 ms, 92% de acerto, US$ 0,004 por pergunta.');
  assert.equal(semUnidade.resultados.find((c) => c.id === 'metricas').ok, false);
  assert.equal(comUnidade.resultados.find((c) => c.id === 'metricas').ok, true);
});
