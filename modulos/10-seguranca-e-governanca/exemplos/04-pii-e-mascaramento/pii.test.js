import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpfValido, luhnValido, mascarar, desmascarar } from './pii.js';

// CPFs e cartões abaixo são de TESTE: gerados para passar no dígito verificador / Luhn, não pertencem a ninguém.
test('CPF: dígito verificador', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('52998224725'), true);
  assert.equal(cpfValido('529.982.247-24'), false); // DV errado
  assert.equal(cpfValido('111.111.111-11'), false); // todos iguais passam no DV, mas são inválidos
});

test('cartão: Luhn', () => {
  assert.equal(luhnValido('4111 1111 1111 1111'), true); // número de teste clássico
  assert.equal(luhnValido('4111 1111 1111 1112'), false);
});

test('mascara CPF, e-mail, telefone e cartão', () => {
  const { texto, contagem } = mascarar(
    'Sou Ana, CPF 529.982.247-25, ana.souza@exemplo.com.br, cel (11) 98765-4321, cartão 4111-1111-1111-1111.',
  );
  assert.equal(texto, 'Sou Ana, CPF [CPF_1], [EMAIL_1], cel [TELEFONE_1], cartão [CARTAO_1].');
  assert.deepEqual(contagem, { EMAIL: 1, CARTAO: 1, CPF: 1, TELEFONE: 1 });
});

test('não mascara número que só PARECE CPF ou cartão', () => {
  const t = 'Pedido 123.456.789-00 e boleto 1234 5678 9012 3456.';
  assert.equal(mascarar(t).texto, t);
});

test('mesmo valor -> mesmo marcador, e desmascarar recupera o original', () => {
  const original = 'CPF 52998224725 e de novo 52998224725; outro: 168.995.350-09';
  const { texto, cofre } = mascarar(original);
  assert.equal(texto, 'CPF [CPF_1] e de novo [CPF_1]; outro: [CPF_2]');
  assert.equal(desmascarar(texto, cofre), original);
});

test('telefone com +55 e fixo com DDD', () => {
  const { texto } = mascarar('Ligue +55 21 99876-5432 ou (31) 3456-7890.');
  assert.equal(texto, 'Ligue [TELEFONE_1] ou [TELEFONE_2].');
});

test('desmascarar parcial: cartão volta só com os 4 últimos dígitos', () => {
  const { texto, cofre } = mascarar('cartão 4111 1111 1111 1111, e-mail a@b.com');
  assert.equal(desmascarar(texto, cofre, { parciais: ['CARTAO'] }), 'cartão ****1111, e-mail a@b.com');
});
