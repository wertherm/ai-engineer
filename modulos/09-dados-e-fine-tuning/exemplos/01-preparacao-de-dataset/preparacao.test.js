// Testes das etapas de preparação (node:test, sem dependência extra). Rode: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { limparTexto, padronizarRotulo, deduplicar, balancear, splitEstratificado, mulberry32 } from './preparacao.js';
import { validarArquivo } from './validar-jsonl.js';

test('limparTexto remove HTML, mascara PII e normaliza caixa alta', () => {
  assert.equal(limparTexto('<p>Oi&nbsp;tudo</p><br>'), 'Oi tudo');
  assert.equal(limparTexto('meu e-mail é ana@exemplo.com.br'), 'meu e-mail é <EMAIL>');
  assert.equal(limparTexto('CPF 123.456.789-01 tel (11) 98876-5432'), 'CPF <CPF> tel <TELEFONE>');
  assert.equal(limparTexto('   O PEDIDO NÃO CHEGOU   '), 'O pedido não chegou');
});

test('padronizarRotulo unifica variantes e descarta fora do domínio', () => {
  assert.equal(padronizarRotulo(' Cobrança '), 'cobranca');
  assert.equal(padronizarRotulo('Logística'), 'entrega');
  assert.equal(padronizarRotulo('elogio'), null);
  assert.equal(padronizarRotulo(''), null);
});

test('deduplicar pega duplicata exata e quase-duplicata, e conta conflito de rótulo', () => {
  const regs = [
    { texto: 'Meu pedido 123 está atrasado há 5 dias.', categoria: 'entrega' },
    { texto: ' meu pedido 123 está atrasado há 5 dias ', categoria: 'cobranca' },
    { texto: 'O fone chegou quebrado.', categoria: 'defeito' },
  ];
  const r = deduplicar(regs);
  assert.equal(r.mantidos.length, 2);
  assert.equal(r.exatas, 1);
  assert.equal(r.conflitos, 1);
});

test('balancear limita cada classe e split estratificado não perde exemplos', () => {
  const regs = [
    ...Array.from({ length: 30 }, (_, i) => ({ texto: `e${i}`, categoria: 'entrega' })),
    ...Array.from({ length: 10 }, (_, i) => ({ texto: `c${i}`, categoria: 'cancelamento' })),
    ...['cobranca', 'acesso', 'defeito'].flatMap((c) => Array.from({ length: 10 }, (_, i) => ({ texto: `${c}${i}`, categoria: c }))),
  ];
  const b = balancear(regs, mulberry32(1));
  assert.equal(b.filter((r) => r.categoria === 'entrega').length, 15); // 1,5 × 10
  const { treino, validacao } = splitEstratificado(b, mulberry32(1));
  assert.equal(treino.length + validacao.length, b.length);
  assert.equal(validacao.filter((r) => r.categoria === 'cancelamento').length, 2);
});

test('validador reprova JSONL com papel inválido, rótulo fora do domínio e poucos exemplos', () => {
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'm09-')), 'ruim.jsonl');
  fs.writeFileSync(arq, [
    JSON.stringify({ messages: [{ role: 'usuario', content: 'oi' }, { role: 'assistant', content: 'entrega' }] }),
    JSON.stringify({ messages: [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'elogio' }] }),
    '{quebrado',
  ].join('\n'));
  const r = validarArquivo(arq);
  assert.ok(r.erros.some((e) => e.includes('papel inválido')));
  assert.ok(r.erros.some((e) => e.includes('fora do domínio')));
  assert.ok(r.erros.some((e) => e.includes('JSON inválido')));
  assert.ok(r.erros.some((e) => e.includes('mínimo 10')));
});
