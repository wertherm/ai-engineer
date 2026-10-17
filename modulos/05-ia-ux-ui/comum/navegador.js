// Chrome headless via playwright-core usando o Google Chrome JÁ instalado (channel 'chrome'):
// nada de baixar browsers com `npx playwright install`.
import { chromium } from 'playwright-core';

export async function abrirNavegador() {
  return chromium.launch({ channel: 'chrome', headless: true });
}
