// Testes da política de resiliência e da fila em memória (sem LLM, rodam em < 1 s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comResiliencia, instavel, lento } from './agentes.js';
import { FilaMemoria } from './fila.js';

const eco = async (e) => ({ ...e, ok: true });

test('retry recupera um agente que falha 2 vezes', async () => {
  const r = await comResiliencia('x', instavel(eco, 2), {}, { tentativas: 3 });
  assert.equal(r.ok, true);
});

test('timeout interrompe um agente travado e esgota as tentativas', async () => {
  await assert.rejects(comResiliencia('x', lento(eco, 300), {}, { tentativas: 2, timeoutMs: 50 }), /esgotou 2 tentativas: timeout/);
});

test('fila em memória manda para a DLQ depois de maxTentativas', async () => {
  const fila = new FilaMemoria({ maxTentativas: 2 });
  fila.consumir('t', async () => { throw new Error('sempre falha'); });
  await fila.publicar('t', { id: 1 });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(fila.dlq.length, 1);
  assert.equal(fila.dlq[0].tentativas, 2);
});
