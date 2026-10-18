"""Teste ponta a ponta da UI Angular "implantada" (versão Playwright Python de ui.e2e.js): Chrome instalado
(headless, channel="chrome", sem baixar browsers) -> nginx -> API Python (REST e MCP) -> Postgres/Ollama.
Pré-requisito: compose Python no ar (python/compose.yaml). Rode: uv run python exemplos/03-entrega-3-front-e-implantacao/python/ui_e2e.py
URL_UI muda o alvo (ex.: http://localhost:31181 testa a mesma UI contra a API JS)."""

import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

URL_UI = os.environ.get("URL_UI", "http://localhost:31191")
PRINT = Path(__file__).with_name("ui.png")


def ok(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok  {msg}")


def textos(page, seletor: str) -> list[str]:
    return page.eval_on_selector_all(seletor, "els => els.map(e => e.textContent)")


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True)
    try:
        page = browser.new_page(viewport={"width": 1100, "height": 900})
        # O SDK MCP (no navegador) tenta abrir um stream SSE com GET /mcp; o servidor é stateless e
        # responde 405, que o cliente trata como "sem stream". Só mostramos os outros erros.
        page.on("console", lambda m: m.type == "error" and "405" not in m.text and print(f"  [console] {m.text}"))
        page.goto(URL_UI)

        print("Tenant acme")
        page.fill("#chave", "sk-acme-demo")
        page.click("#conectar")
        page.wait_for_selector("#tenant")
        ok("Acme Software" in page.text_content("#tenant"), "API key identifica o tenant (REST /v1/me)")
        tools = textos(page, "#tools code")
        ok(len(tools) == 3 and "perguntar" in tools, f"UI descobriu as tools via MCP: {', '.join(tools)}")
        docs = textos(page, "#documentos code")
        ok("home-office.md" in docs, f"documentos via MCP: {', '.join(docs)}")

        page.fill("#pergunta", "Qual o valor do auxílio home office?")
        page.click("#perguntar")
        page.wait_for_selector("#resposta", timeout=900_000)  # sem cache, o LLM em CPU pode levar minutos
        resposta = page.text_content("#resposta p")
        ok("150" in resposta, f'resposta: "{resposta.strip()[:90]}..."')
        citacoes = page.text_content("#citacoes")
        ok("home-office.md" in citacoes, f"citação mostrada: {re.sub(r'\s+', ' ', citacoes).strip()}")
        print(f"  ..  {re.sub(r'\s+', ' ', page.text_content('#meta')).strip()}")

        page.click("#buscar")
        page.wait_for_selector("#trechos li")
        ok("home-office.md" in page.text_content("#trechos li"), "busca de trechos pela tool MCP buscar_politicas")
        page.screenshot(path=str(PRINT), full_page=True)

        print("Tenant padaria (isolamento na UI)")
        page.fill("#chave", "sk-padaria-demo")
        page.click("#conectar")
        page.wait_for_function("() => document.querySelector('#tenant')?.textContent.includes('Padaria')")
        docs_padaria = textos(page, "#documentos code")
        ok("home-office.md" not in docs_padaria, f"padaria vê só os seus: {', '.join(docs_padaria)}")

        print("Chave inválida")
        page.fill("#chave", "sk-errada")
        page.click("#conectar")
        page.wait_for_selector("#erro")
        erro = page.text_content("#erro").strip()
        ok("API key" in erro, f"erro exibido: {erro}")
        print(f"\nUI ok · screenshot em {str(PRINT).split('/modulos/')[1]}")
    finally:
        browser.close()
