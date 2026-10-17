// Teste ponta a ponta da UI Angular "implantada" (docker compose): navegador real (Chrome instalado,
// headless) -> nginx -> API (REST e MCP) -> Postgres/Ollama. Usa playwright-core (sem baixar browsers).
// Pré-requisito: npm run e3:subir. Rode: npm run e3:ui
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const URL_UI = process.env.URL_UI ?? 'http://localhost:31181';
const PRINT = fileURLToPath(new URL('./ui.png', import.meta.url));
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  console.log(`  ok  ${msg}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  // O SDK MCP tenta abrir um stream SSE com GET /mcp; o servidor é stateless e responde 405, que o
  // cliente trata como "sem stream" (comportamento previsto na spec). Só mostramos os outros erros.
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('405') && console.log(`  [console] ${m.text()}`));
  await page.goto(URL_UI);

  console.log('Tenant acme');
  await page.fill('#chave', 'sk-acme-demo');
  await page.click('#conectar');
  await page.waitForSelector('#tenant');
  ok((await page.textContent('#tenant')).includes('Acme Software'), 'API key identifica o tenant (REST /v1/me)');
  const tools = await page.$$eval('#tools code', (els) => els.map((e) => e.textContent));
  ok(tools.length === 3 && tools.includes('perguntar'), `UI descobriu as tools via MCP: ${tools.join(', ')}`);
  const docs = await page.$$eval('#documentos code', (els) => els.map((e) => e.textContent));
  ok(docs.includes('home-office.md'), `documentos via MCP: ${docs.join(', ')}`);

  await page.fill('#pergunta', 'Qual o valor do auxílio home office?');
  await page.click('#perguntar');
  // Sem cache, o LLM em CPU pode levar minutos: espera generosa.
  await page.waitForSelector('#resposta', { timeout: 900_000 });
  const resposta = await page.textContent('#resposta p');
  ok(/150/.test(resposta), `resposta: "${resposta.trim().slice(0, 90)}..."`);
  const citacoes = await page.textContent('#citacoes');
  ok(citacoes.includes('home-office.md'), `citação mostrada: ${citacoes.replace(/\s+/g, ' ').trim()}`);
  console.log(`  ..  ${(await page.textContent('#meta')).replace(/\s+/g, ' ').trim()}`);

  await page.click('#buscar');
  await page.waitForSelector('#trechos li');
  ok((await page.textContent('#trechos li')).includes('home-office.md'), 'busca de trechos pela tool MCP buscar_politicas');
  await page.screenshot({ path: PRINT, fullPage: true });

  console.log('Tenant padaria (isolamento na UI)');
  await page.fill('#chave', 'sk-padaria-demo');
  await page.click('#conectar');
  await page.waitForFunction(() => document.querySelector('#tenant')?.textContent.includes('Padaria'));
  const docsPadaria = await page.$$eval('#documentos code', (els) => els.map((e) => e.textContent));
  ok(!docsPadaria.includes('home-office.md'), `padaria vê só os seus: ${docsPadaria.join(', ')}`);

  console.log('Chave inválida');
  await page.fill('#chave', 'sk-errada');
  await page.click('#conectar');
  await page.waitForSelector('#erro');
  ok((await page.textContent('#erro')).includes('API key'), `erro exibido: ${(await page.textContent('#erro')).trim()}`);
  console.log(`\nUI ok · screenshot em ${PRINT.split('/modulos/')[1]}`);
} finally {
  await browser.close();
}
