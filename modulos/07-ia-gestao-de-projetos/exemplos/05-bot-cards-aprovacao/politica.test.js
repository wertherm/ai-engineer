import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precisaAprovacao, lembretes } from './politica.js';

test('arquivar e prioridade alta exigem aprovação', () => {
  assert.ok(precisaAprovacao({ acao: 'arquivar', prioridade: 'manter' }));
  assert.ok(precisaAprovacao({ acao: 'criar', prioridade: 'alta' }));
  assert.equal(precisaAprovacao({ acao: 'mover', prioridade: 'alta' }), null);
});

test('lembra card sem dono vencendo em 48h e ignora o que está Feito', () => {
  const listas = [{ id: 'l1', name: 'Backlog' }, { id: 'l3', name: 'Feito' }];
  const agora = new Date('2026-11-02T12:00:00Z');
  const cards = [
    { name: 'A', idList: 'l1', due: '2026-11-03T12:00:00Z', idMembers: [] },
    { name: 'B', idList: 'l3', due: '2026-11-01T12:00:00Z', idMembers: [] },
    { name: 'C', idList: 'l1', due: '2026-11-03T12:00:00Z', idMembers: ['ana'] },
  ];
  assert.deepEqual(lembretes(cards, listas, agora), ['🟡 "A" vence em 24h e está sem responsável']);
});

test('hash da trilha não depende da ordem das chaves (jsonb reordena)', async () => {
  const { hashDe, pool } = await import('./trilha.js');
  const base = { solicitante: 'w', pedido: 'p', status: 'executado' };
  assert.equal(
    hashDe('genesis', { ...base, operacao: { lista: 'Feito', acao: 'mover' } }),
    hashDe('genesis', { ...base, operacao: { acao: 'mover', lista: 'Feito' } }),
  );
  await pool.end();
});
