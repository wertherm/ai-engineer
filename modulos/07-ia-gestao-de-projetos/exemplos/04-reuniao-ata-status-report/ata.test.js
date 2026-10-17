import { test } from 'node:test';
import assert from 'node:assert/strict';
import { participantes, validarAta, gerarIcs, calendario } from './ata.js';
import { metricasSprint, numerosSemLastro } from './status.js';

test('participantes saem da transcrição', () => {
  assert.deepEqual(participantes('[09:00] Ana (dev): oi\n[09:01] Bruno: ok\n[09:02] Ana: tchau'), ['Ana', 'Bruno']);
});

test('valida responsável inventado e prazo fora do formato', () => {
  const p = validarAta({ decisoes: [], pendencias: [], acoes: [{ responsavel: 'Zé', tarefa: 'x', prazo: 'quinta' }] }, ['Ana']);
  assert.equal(p.length, 2);
});

test('ICS tem um VTODO por ação com prazo', () => {
  const ics = gerarIcs([{ responsavel: 'Ana', tarefa: 't', prazo: '2026-11-04' }, { responsavel: 'Ana', tarefa: 'u', prazo: 'sem prazo' }], new Date('2026-11-02T00:00:00Z'));
  assert.equal(ics.match(/BEGIN:VTODO/g).length, 1);
  assert.match(ics, /DUE;VALUE=DATE:20261104/);
});

test('semáforo amarelo com bloqueio e entrega igual ao tempo', () => {
  const m = metricasSprint({ pontosPlanejados: 30, pontosEntregues: 21, diasRestantes: 3, diasTotais: 10, bugsCriticos: 1, itensBloqueados: ['x'], orcamentoPrevisto: 120000, orcamentoGasto: 96000, percentualEscopoConcluido: 70 });
  assert.equal(m.semaforo, 'amarelo');
  assert.equal(m.cpi, 0.88);
});

test('calendário resolve dia da semana', () => {
  assert.deepEqual(calendario('2026-11-02', 3).map((c) => c.dia), ['segunda', 'terça', 'quarta']);
});

test('número inventado é sinalizado', () => {
  assert.deepEqual(numerosSemLastro('CPI 0,88 e atraso de 5 dias', '{"cpi":0.88}'), [5]);
});
