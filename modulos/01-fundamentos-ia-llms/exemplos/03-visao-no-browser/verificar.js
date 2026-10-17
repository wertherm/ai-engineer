// Verificação automatizada: sobe o servidor, abre a página no Chrome headless (Playwright),
// espera o vídeo terminar e imprime o que o modelo detectou e rastreou. Salva um screenshot.
import { chromium } from 'playwright-core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciarServidor } from './servidor.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const server = await iniciarServidor();
const url = `http://127.0.0.1:${server.address().port}/`;

// playwright-core não baixa browser: usamos o Google Chrome instalado (channel 'chrome').
// Sem Chrome? `npx playwright install chromium` e troque para { } (Chromium do Playwright).
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
  page.on('pageerror', (e) => console.error('[erro na página]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.resultado?.pronto, null, { timeout: 120_000 });
  const r = await page.evaluate(() => window.resultado);

  const msMedio = r.porFrame.reduce((s, f) => s + f.ms, 0) / r.frames;
  console.log(`frames processados: ${r.frames} | inferência média: ${msMedio.toFixed(1)} ms/frame (WASM, CPU)`);
  console.log('primeiro frame:', r.porFrame[0].objs.join(', '));
  console.log('último frame:  ', r.porFrame.at(-1).objs.join(', '));
  console.log('trilhas (id rótulo -> em quantos frames apareceu):');
  for (const [k, v] of Object.entries(r.ids).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${v}`);

  await page.locator('#saida').screenshot({ path: join(aqui, 'assets', 'resultado.png') });
  console.log('screenshot do canvas: exemplos/03-visao-no-browser/assets/resultado.png');
} finally {
  await browser.close();
  server.close();
}
