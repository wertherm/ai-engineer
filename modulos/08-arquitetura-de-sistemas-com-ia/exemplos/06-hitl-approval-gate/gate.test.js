import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avaliar } from './gate.js';

const politica = JSON.parse(readFileSync(new URL('./politica.json', import.meta.url)));

test('alta confiança e valor baixo passa direto', () => {
  assert.equal(avaliar({ tipo: 'reenviar_boleto', valor: 100, confianca: 0.99 }, politica).decisao, 'automatica');
});
test('confiança abaixo do limiar vai para humano', () => {
  assert.equal(avaliar({ tipo: 'reenviar_boleto', valor: 100, confianca: 0.5 }, politica).decisao, 'pendente');
});
test('confiança alta NÃO libera ação sensível nem valor alto', () => {
  assert.equal(avaliar({ tipo: 'cancelar_operacao', confianca: 1 }, politica).decisao, 'pendente');
  assert.equal(avaliar({ tipo: 'conceder_desconto', valor: 99999, confianca: 1 }, politica).decisao, 'pendente');
});
test('ação proibida é bloqueada antes de tudo', () => {
  assert.equal(avaliar({ tipo: 'excluir_cliente', confianca: 1 }, politica).decisao, 'bloqueada');
});
