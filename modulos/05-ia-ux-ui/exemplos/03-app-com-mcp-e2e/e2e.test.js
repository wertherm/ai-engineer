// Teste E2E determinístico (sem LLM): a UI é dirigida pelo Playwright e o estado é preparado e
// conferido pelo MCP da própria aplicação. É a versão "roteirizada" do que o agente faz.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from './app.js';
import { criarEstado } from './estado.js';
import { conectarMcp, chamar, renderizarRecursoUi } from './cliente-mcp.js';
import { abrirNavegador } from '../../comum/navegador.js';

const PORT = Number(process.env.PORT ?? 30511);
const BASE = `http://127.0.0.1:${PORT}`;
let http, browser, mcp;

before(async () => {
  http = criarApp(criarEstado()).listen(PORT, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  browser = await abrirNavegador();
  mcp = await conectarMcp(BASE);
});
after(async () => { await mcp.close(); await browser.close(); http.close(); });

test('MCP exige token', async () => {
  const r = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' });
  assert.equal(r.status, 401);
});

test('adicionar e concluir pela UI, conferindo pelo MCP', async () => {
  await chamar(mcp, 'resetar_estado');
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.getByLabel('Nova tarefa').fill('Comprar café');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await page.getByRole('status').filter({ hasText: 'adicionada' }).waitFor();
  assert.deepEqual(await chamar(mcp, 'listar_tarefas'), [{ id: 1, titulo: 'Comprar café', concluida: false }]);

  await page.getByLabel('Comprar café').check();
  await page.getByRole('status').filter({ hasText: 'concluída' }).waitFor();
  assert.equal((await chamar(mcp, 'listar_tarefas'))[0].concluida, true);
  await page.close();
});

test('recurso de UI (MCP Apps) é anunciado e age via tools/call', async () => {
  await chamar(mcp, 'resetar_estado');
  await chamar(mcp, 'adicionar_tarefa', { titulo: 'Revisar PR' });
  const { tools } = await mcp.listTools();
  assert.equal(tools.find((t) => t.name === 'mostrar_painel')._meta.ui.resourceUri, 'ui://tarefas/painel');

  const page = await browser.newPage();
  const { recurso, chamadas, frame } = await renderizarRecursoUi(page, mcp, 'ui://tarefas/painel');
  assert.equal(recurso.mimeType, 'text/html;profile=mcp-app');
  await frame.getByRole('button', { name: 'Concluir Revisar PR' }).click();
  // o clique dispara um postMessage assíncrono: espera a chamada chegar ao MCP (até 2 s)
  for (let i = 0; i < 20 && !chamadas.length; i++) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(chamadas, ['concluir_tarefa']);
  assert.equal((await chamar(mcp, 'listar_tarefas'))[0].concluida, true);
  await page.close();
});
