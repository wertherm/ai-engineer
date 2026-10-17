// Teste determinístico (sem LLM) da auditoria: garante que o "juiz" do exemplo funciona antes de
// confiarmos nele para julgar o que o LLM gera.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { abrirNavegador } from '../../comum/navegador.js';
import { auditar, nota } from '../../comum/acessibilidade.js';

let browser;
before(async () => { browser = await abrirNavegador(); });
after(async () => { await browser.close(); });

test('HTML com problemas clássicos perde pontos', async () => {
  const ruim = '<img src="logo.png"><input type="email" placeholder="E-mail"><p style="color:#ccc">texto claro</p>';
  const r = await auditar(browser, ruim);
  const ids = r.violacoes.map((v) => v.id);
  assert.ok(ids.includes('image-alt'), 'deveria acusar imagem sem alt');
  // O axe aceita placeholder como nome acessível; quem acusa é a nossa checagem própria.
  assert.ok(!ids.includes('label'));
  assert.ok(ids.includes('rotulo-visivel'), 'deveria acusar campo só com placeholder');
  assert.ok(ids.includes('color-contrast'), 'deveria acusar contraste baixo');
  assert.equal(r.nota, 100 - 25 - 15 - 15);
});

test('HTML acessível tira 100', async () => {
  const bom = '<h1>Newsletter</h1><img src="logo.png" alt="Logo da ACME"><label for="e">E-mail</label><input id="e" type="email"><p style="color:#595959">texto</p>';
  const r = await auditar(browser, bom);
  assert.deepEqual(r.violacoes, []);
  assert.equal(r.nota, 100);
});

test('nota desconta por nó afetado e por impacto', () => {
  assert.equal(nota([{ impact: 'critical', nodes: ['a', 'b'] }, { impact: 'minor', nodes: ['c'] }]), 100 - 50 - 3);
});

test('documento sem conteúdo (resposta cortada) tira 0, não 100', async () => {
  const r = await auditar(browser, '<style>body{color:#333}</style>');
  assert.equal(r.elementos, 0);
  assert.equal(r.nota, 0);
});
