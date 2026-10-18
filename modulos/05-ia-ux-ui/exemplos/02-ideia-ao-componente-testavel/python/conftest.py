"""Fixtures do exemplo 02 (versão Python): o componente JS é carregado no Chrome headless e a fixture
`renderizar(args)` chama renderPaginacao(args) dentro da página.

Qual arquivo testar vem de COMPONENTE (caminho relativo à pasta do exemplo). Default: a correção
humana, para `uv run pytest` passar; o main.py aponta para python/gerado/paginacao.js.
"""

import os
from pathlib import Path

import pytest

from comum_py.componente_js import ComponenteJS, abrir_chrome_sync

EXEMPLO = Path(__file__).resolve().parent.parent
# Os testes gerados pelo LLM ficam fora da coleta padrão (podem vir quebrados); o main.py os roda
# explicitamente com TESTES_LLM=1.
collect_ignore_glob = [] if os.environ.get("TESTES_LLM") else ["gerado/*"]


@pytest.fixture(scope="module")
def componente():
    arquivo = EXEMPLO / os.environ.get("COMPONENTE", "correcao-humana/paginacao.js")
    pw, browser, page = abrir_chrome_sync()
    try:
        yield ComponenteJS(page, arquivo)
    finally:
        browser.close()
        pw.stop()


@pytest.fixture
def renderizar(componente):
    """renderizar({"paginaAtual": 2, "totalPaginas": 3}) -> str HTML; erro do JS -> ErroJS."""
    return lambda args: componente.chamar("renderPaginacao", args)
