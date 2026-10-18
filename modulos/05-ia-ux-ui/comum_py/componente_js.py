"""Ponte pytest -> componente JavaScript que roda no NAVEGADOR.

O componente gerado pelo LLM continua sendo JS (ele roda no browser), então o Python não o "porta":
carrega o arquivo .js como ES module numa página do Chrome headless e chama a função exportada por
page.evaluate. Erros lançados no JS (ex.: RangeError) voltam como ErroJS, com o nome do erro.
Usa a API SÍNCRONA do Playwright: as fixtures ficam simples para testes sync (inclusive os do LLM).
"""

from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright


class ErroJS(Exception):
    """Erro lançado pelo código JS; `nome` é o tipo do erro no JS (RangeError, TypeError...)."""

    def __init__(self, nome: str, mensagem: str):
        super().__init__(f"{nome}: {mensagem}")
        self.nome = nome


# Importa o código como módulo a partir de uma data: URL (a página é about:blank, sem servidor) e
# expõe todas as exportações em window.__mod.
_CARREGAR = """async src => {
  const url = 'data:text/javascript;base64,' + btoa(String.fromCharCode(...new TextEncoder().encode(src)));
  window.__mod = await import(url);
  return Object.keys(window.__mod);
}"""
_CHAMAR = """([nome, args]) => {
  try { return { ok: window.__mod[nome](args) }; }
  catch (e) { return { erro: e?.name ?? 'Error', mensagem: String(e?.message ?? e) }; }
}"""


class ComponenteJS:
    def __init__(self, page: Page, arquivo: Path):
        self.page = page
        self.exportacoes = page.evaluate(_CARREGAR, Path(arquivo).read_text())

    def chamar(self, funcao: str, args: Any) -> Any:
        if funcao not in self.exportacoes:
            raise ErroJS("ReferenceError", f"o módulo não exporta {funcao} (exporta: {self.exportacoes})")
        r = self.page.evaluate(_CHAMAR, [funcao, args])
        if "erro" in r:
            raise ErroJS(r["erro"], r["mensagem"])
        return r["ok"]


def abrir_chrome_sync():
    """Devolve (playwright, browser, page) com o Google Chrome instalado (channel="chrome")."""
    pw = sync_playwright().start()
    browser = pw.chromium.launch(channel="chrome", headless=True)
    return pw, browser, browser.new_page()
