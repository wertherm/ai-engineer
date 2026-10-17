// Solução do exercício 02: E2E que cria e conclui tarefas PELA UI e confere com a tool nova
// buscar_tarefas PELO MCP. Uso: node --test exercicios/02-tool-mcp-e-teste-e2e/solucao/e2e.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../../../exemplos/03-app-com-mcp-e2e/app.js';
import { criarEstado } from '../../../exemplos/03-app-com-mcp-e2e/estado.js';
import { conectarMcp, chamar } from '../../../exemplos/03-app-com-mcp-e2e/cliente-mcp.js';
import { abrirNavegador } from '../../../comum/navegador.js';
import { registrarBuscarTarefas } from './tool-buscar.js';

const PORT = Number(process.env.PORT ?? 30530);
const BASE = `http://127.0.0.1:${PORT}`;
let http, browser, mcp;

before(async () => {
  http = criarApp(criarEstado(), { extrasMcp: registrarBuscarTarefas }).listen(PORT, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  browser = await abrirNavegador();
  mcp = await conectarMcp(BASE);
});
after(async () => { await mcp.close(); await browser.close(); http.close(); });

test('a tool nova aparece no tools/list com schema e é somente leitura', async () => {
  const { tools } = await mcp.listTools();
  const t = tools.find((x) => x.name === 'buscar_tarefas');
  assert.ok(t, 'buscar_tarefas deveria estar registrada');
  assert.deepEqual(Object.keys(t.inputSchema.properties).sort(), ['concluida', 'texto']);
  assert.equal(t.annotations.readOnlyHint, true);
});

test('UI cria e conclui; MCP filtra por texto e status', async () => {
  await chamar(mcp, 'resetar_estado');
  const page = await browser.newPage();
  await page.goto(BASE);
  for (const titulo of ['Comprar café', 'Lavar a louça', 'Café com o time']) {
    await page.getByLabel('Nova tarefa').fill(titulo);
    await page.getByRole('button', { name: 'Adicionar' }).click();
    await page.getByLabel(titulo, { exact: true }).waitFor(); // espera a lista redesenhar
  }
  await page.getByLabel('Comprar café', { exact: true }).check();
  await page.getByRole('status').filter({ hasText: 'concluída' }).waitFor();

  const comCafe = await chamar(mcp, 'buscar_tarefas', { texto: 'cafe' });
  assert.deepEqual(comCafe.map((t) => t.titulo), ['Comprar café', 'Café com o time']);
  const pendentes = await chamar(mcp, 'buscar_tarefas', { concluida: false });
  assert.deepEqual(pendentes.map((t) => t.titulo), ['Lavar a louça', 'Café com o time']);
  const cafePendente = await chamar(mcp, 'buscar_tarefas', { texto: 'CAFÉ', concluida: false });
  assert.deepEqual(cafePendente.map((t) => t.id), [3]);
  await page.close();
});

test('entrada inválida é recusada pelo schema (sem tocar no estado)', async () => {
  const r = await mcp.callTool({ name: 'buscar_tarefas', arguments: { concluida: 'sim' } });
  assert.equal(r.isError, true);
});
