import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rice, wsjf, moscow, roadmap, alinhamentoOkr } from './priorizar.js';

const { itens, okrs, capacidadePorSprint } = JSON.parse(readFileSync(new URL('./backlog.json', import.meta.url), 'utf8'));
const porId = Object.fromEntries(itens.map((i) => [i.id, i]));

test('RICE e WSJF batem com a fórmula', () => {
  assert.equal(rice(porId['HU-01']), 4000 * 2 * 0.8 / 5); // 1280
  assert.equal(wsjf(porId['HU-02']), (5 + 13 + 13) / 1); // 31
});

test('regulatório vira Must e propaga para a dependência', () => {
  const c = moscow(itens);
  assert.equal(c.get('HU-02'), 'Must');
  assert.equal(c.get('HU-01'), 'Must');
  assert.equal(c.get('HU-05'), "Won't");
});

test('roadmap respeita dependência e capacidade', () => {
  const plano = roadmap(itens, capacidadePorSprint, moscow(itens));
  const sprintDe = (id) => plano.findIndex((s) => s.includes(id));
  assert.ok(sprintDe('HU-01') < sprintDe('HU-02'));
  for (const s of plano) assert.ok(s.reduce((t, id) => t + porId[id].jobSize, 0) <= capacidadePorSprint);
});

test('alinhamento acusa item sem KR', () => {
  assert.deepEqual(alinhamentoOkr(okrs, itens).itensSemKr, ['HU-05']);
});
