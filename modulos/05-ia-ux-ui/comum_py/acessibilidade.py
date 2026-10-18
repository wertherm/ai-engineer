"""Auditoria de acessibilidade de um trecho de HTML (espelha comum/acessibilidade.js): renderiza no
Chrome headless, roda o axe-core (WCAG 2.0/2.1 A e AA) e devolve violações + uma nota de 0 a 100.

O axe é o MESMO arquivo que o lado JS usa (node_modules/axe-core/axe.min.js, 4.14.0), injetado com
page.add_script_tag + page.evaluate("axe.run(...)"). Escolhemos isso em vez do pacote
axe-playwright-python 0.1.8 porque ele embute o axe 4.12.1 (regras e mensagens diferentes do JS) e é
só um wrapper dessas mesmas duas chamadas. Requisito: `npm install` na pasta do módulo.
"""

import re
from pathlib import Path

from playwright.async_api import Browser

AXE_JS = Path(__file__).resolve().parent.parent / "node_modules" / "axe-core" / "axe.min.js"
TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

# Peso por impacto: um "critical" (ex.: imagem sem alt) pesa mais que um "minor".
PESO = {"critical": 25, "serious": 15, "moderate": 8, "minor": 3}


def nota(violacoes: list[dict]) -> int:
    # Cada NÓ afetado desconta: 3 inputs sem label são 3 problemas para quem usa leitor de tela.
    desconto = sum(PESO.get(v["impact"], 5) * len(v["nodes"]) for v in violacoes)
    return max(0, 100 - desconto)


def documento(html_trecho: str, titulo: str = "Componente gerado") -> str:
    """Garante um documento completo: o axe também cobra <html lang>, <title> e landmarks."""
    if re.search(r"<html[\s>]", html_trecho, re.I):
        return html_trecho
    return (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>{titulo}</title></head>'
            f"<body><main>{html_trecho}</main></body></html>")


# Checagens próprias, iguais às do JS (rodam DENTRO da página, por isso são JavaScript).
JS_SEM_ROTULO = """els => els.filter(el => !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')))
  .map(el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}[name=${el.name || '?'}]`)"""
JS_CLICAVEIS = "els => els.map(el => `${el.tagName.toLowerCase()}[onclick]`)"


async def auditar(browser: Browser, html: str, screenshot: str | Path | None = None) -> dict:
    if not AXE_JS.exists():
        raise FileNotFoundError(f"{AXE_JS} não existe: rode `npm install` na pasta do módulo")
    contexto = await browser.new_context(viewport={"width": 800, "height": 600})
    page = await contexto.new_page()
    try:
        await page.set_content(documento(html), wait_until="load")
        if screenshot:
            await page.screenshot(path=str(screenshot), full_page=True)
        await page.add_script_tag(path=str(AXE_JS))
        r = await page.evaluate("tags => axe.run(document, { runOnly: { type: 'tag', values: tags } })", TAGS)
        violacoes = [{"id": v["id"], "impact": v["impact"], "help": v["help"],
                      "nodes": [" ".join(n["target"]) for n in v["nodes"]]} for v in r["violations"]]
        # Checagem própria: o axe aceita `placeholder` como nome acessível, mas o placeholder some ao
        # digitar e costuma ter contraste baixo (WCAG 3.3.2 pede rótulo visível). Cobramos <label>.
        sem_rotulo = await page.eval_on_selector_all(
            "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea", JS_SEM_ROTULO)
        # Checagem própria 2: "div clicável" não recebe foco nem é anunciado como botão (o axe não pega).
        clicaveis = await page.eval_on_selector_all("[onclick]:not(button):not(a):not(input)", JS_CLICAVEIS)
        if clicaveis:
            violacoes.append({"id": "clicavel-sem-semantica", "impact": "serious",
                              "help": "Elemento com onclick precisa ser <button> ou <a> (teclado e leitor de tela)", "nodes": clicaveis})
        if sem_rotulo:
            violacoes.append({"id": "rotulo-visivel", "impact": "serious",
                              "help": "Campos precisam de <label> visível (placeholder não substitui rótulo)", "nodes": sem_rotulo})
        # "Zero violações" num documento vazio não é mérito: conta o que de fato foi renderizado.
        elementos = await page.eval_on_selector_all("body *:not(style):not(script):not(main)", "els => els.length")
        return {"violacoes": violacoes, "nota": nota(violacoes) if elementos else 0,
                "aprovados": len(r["passes"]), "elementos": elementos}
    finally:
        await contexto.close()


def resumo_para_llm(violacoes: list[dict]) -> str:
    """Texto curto com as violações, para devolver ao LLM como feedback na próxima iteração."""
    return "\n".join(f"- [{v['impact']}] {v['id']}: {v['help']} (em: {', '.join(v['nodes'][:3])})" for v in violacoes)
