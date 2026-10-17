// Verificação ponta a ponta do exemplo 04 no Chrome headless:
// 1) busca semântica e personalização, 2) chatbot de suporte, 3) a chave NUNCA chega ao browser,
// 4) validação de entrada e rate limit acontecem ANTES de gastar token.
// Uso: node exemplos/04-ia-cliente-vs-servidor/verificar.js
// Ollama aceita qualquer chave: usamos uma "chave sentinela" para provar que ela não vaza.
process.env.OPENAI_API_KEY ??= 'sk-sentinela-nao-deve-vazar-123';
const SEGREDO = process.env.OPENAI_API_KEY;
const { criarServidor } = await import('./servidor.js');
const { abrirNavegador } = await import('../../comum/navegador.js');
const { BASE_URL } = await import('../../comum/config.js');

const PORT = Number(process.env.PORT ?? 30521);
const BASE = `http://127.0.0.1:${PORT}`;
const { app, fechar } = await criarServidor({ limiteBusca: 6, limiteChat: 3 });
const http = app.listen(PORT, '127.0.0.1');
await new Promise((r) => http.once('listening', r));

const browser = await abrirNavegador();
const page = await browser.newPage();
// Espiona TUDO que o navegador pede e recebe.
const urls = [];
const corpos = [];
page.on('request', (r) => urls.push(r.url()));
page.on('response', async (r) => { try { corpos.push(await r.text()); } catch { /* redirects etc. */ } });
await page.goto(BASE);

// 1) Busca semântica: a pergunta não tem as mesmas palavras da FAQ ("chega" x "prazo de entrega").
await page.getByLabel('Buscar na ajuda').fill('em quantos dias meu café chega?');
await page.getByRole('button', { name: 'Buscar' }).click();
await page.locator('article').first().waitFor();
const top = await page.locator('article h2').allTextContents();
console.log(`Busca "em quantos dias meu café chega?" -> ${JSON.stringify(top)}`);

// Personalização: clicar num resultado de assinatura e repetir uma busca ambígua.
await page.getByLabel('Buscar na ajuda').fill('quero cancelar');
await page.getByRole('button', { name: 'Buscar' }).click();
await page.waitForFunction(() => document.querySelector('article small')?.textContent.includes('score'));
const antes = await page.locator('article small').allTextContents();
await page.locator('article[data-categoria=assinatura]').first().click();
await page.getByRole('button', { name: 'Buscar' }).click();
await page.waitForTimeout(1500);
const depois = await page.locator('article small').allTextContents();
console.log(`Personalização "quero cancelar": antes ${JSON.stringify(antes)}\n                                depois ${JSON.stringify(depois)} (interesses=${await page.evaluate(() => localStorage.getItem('interesses'))})`);

// 2) Chatbot de suporte (RAG no servidor).
await page.getByLabel('Pergunte ao assistente').fill('Posso pagar com Pix? Tem desconto?');
await page.getByRole('button', { name: 'Perguntar' }).click();
await page.waitForFunction(() => !['', 'Pensando...'].includes(document.getElementById('resposta').textContent), null, { timeout: 600_000 });
console.log(`Chatbot: ${await page.locator('#resposta').textContent()}`);

// 3) A chave e o endpoint do modelo nunca aparecem do lado do navegador.
const origemModelo = new URL(BASE_URL).origin;
const vazouUrl = urls.some((u) => u.startsWith(origemModelo));
const vazouChave = corpos.some((c) => c.includes(SEGREDO)) || (await page.content()).includes(SEGREDO);
console.log(`Requisições do browser: ${urls.length}, todas para ${BASE}? ${urls.every((u) => u.startsWith(BASE))}`);
console.log(`Browser chamou ${origemModelo}? ${vazouUrl} | chave apareceu em alguma resposta? ${vazouChave}`);

// 4) Proteções que não gastam token: validação e rate limit.
const tamanho = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pergunta: 'x'.repeat(301) }) });
console.log(`Pergunta com 301 caracteres -> HTTP ${tamanho.status}`);
// Rajada de 7 requisições inválidas (q vazio): o rate limit roda ANTES da validação e do embedding,
// então nem um token é gasto e o abusador recebe 429 assim que passa do limite (6/min).
const status = [];
for (let i = 0; i < 7; i++) {
  const r = await fetch(`${BASE}/api/busca`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: '' }) });
  status.push(r.status);
}
console.log(`Rajada de 7 buscas inválidas (limite 6/min) -> ${status.join(', ')}`);

await browser.close();
http.close();
await fechar();
const ok = !vazouUrl && !vazouChave && tamanho.status === 400 && status.includes(429);
console.log(ok ? 'Verificação OK' : 'Verificação FALHOU');
process.exitCode = ok ? 0 : 1;
