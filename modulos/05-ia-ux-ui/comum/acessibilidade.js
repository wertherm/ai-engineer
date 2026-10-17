// Auditoria de acessibilidade de um trecho de HTML: renderiza no Chrome headless, roda o axe-core
// (regras WCAG 2.0/2.1 A e AA) e devolve violações + uma nota de 0 a 100.
import { AxeBuilder } from '@axe-core/playwright';

// Peso por impacto: um "critical" (ex.: imagem sem alt) pesa mais que um "minor".
const PESO = { critical: 25, serious: 15, moderate: 8, minor: 3 };

export function nota(violacoes) {
  // Cada NÓ afetado desconta: 3 inputs sem label são 3 problemas para quem usa leitor de tela.
  const desconto = violacoes.reduce((s, v) => s + (PESO[v.impact] ?? 5) * v.nodes.length, 0);
  return Math.max(0, 100 - desconto);
}

// Garante um documento completo: o axe também cobra <html lang>, <title> e landmarks.
export function documento(htmlTrecho, titulo = 'Componente gerado') {
  if (/<html[\s>]/i.test(htmlTrecho)) return htmlTrecho;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title></head><body><main>${htmlTrecho}</main></body></html>`;
}

export async function auditar(browser, html, { screenshot } = {}) {
  // browser.newPage() NÃO serve: o AxeBuilder abre páginas auxiliares no mesmo contexto e falha com
  // "Please use browser.newContext()". Criamos um contexto explícito (e o fechamos no fim).
  const contexto = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await contexto.newPage();
  try {
    await page.setContent(documento(html), { waitUntil: 'load' });
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const violacoes = r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) }));
    // Checagem própria: o axe aceita `placeholder` como nome acessível, mas o placeholder some ao
    // digitar e costuma ter contraste baixo (WCAG 3.3.2 pede rótulo visível). Cobramos <label>.
    const semRotulo = await page.$$eval('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea', (els) =>
      els.filter((el) => !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')))
        .map((el) => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}[name=${el.name || '?'}]`));
    // Checagem própria 2: "div clicável" não recebe foco nem é anunciado como botão (o axe não pega).
    const clicaveis = await page.$$eval('[onclick]:not(button):not(a):not(input)', (els) => els.map((el) => `${el.tagName.toLowerCase()}[onclick]`));
    if (clicaveis.length) violacoes.push({ id: 'clicavel-sem-semantica', impact: 'serious', help: 'Elemento com onclick precisa ser <button> ou <a> (teclado e leitor de tela)', nodes: clicaveis });
    if (semRotulo.length) violacoes.push({ id: 'rotulo-visivel', impact: 'serious', help: 'Campos precisam de <label> visível (placeholder não substitui rótulo)', nodes: semRotulo });
    // "Zero violações" num documento vazio não é mérito: conta o que de fato foi renderizado.
    const elementos = await page.$$eval('body *:not(style):not(script):not(main)', (els) => els.length);
    return { violacoes, nota: elementos ? nota(violacoes) : 0, aprovados: r.passes.length, elementos };
  } finally {
    await contexto.close();
  }
}

// Texto curto com as violações, para devolver ao LLM como feedback na próxima iteração.
export function resumoParaLLM(violacoes) {
  return violacoes.map((v) => `- [${v.impact}] ${v.id}: ${v.help} (em: ${v.nodes.slice(0, 3).join(', ')})`).join('\n');
}
