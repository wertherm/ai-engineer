"""Teste determinístico (sem LLM) da auditoria: garante que o "juiz" funciona antes de confiarmos
nele para julgar o que o LLM gera. Uso: uv run pytest exemplos/01-text-to-ui-acessivel/python"""

import pytest

from comum_py.acessibilidade import auditar, nota
from comum_py.navegador import abrir_navegador, fechar_navegador

pytestmark = pytest.mark.anyio


@pytest.fixture(scope="module")
async def browser():
    pw, b = await abrir_navegador()
    yield b
    await fechar_navegador(pw, b)


async def test_html_com_problemas_classicos_perde_pontos(browser):
    ruim = '<img src="logo.png"><input type="email" placeholder="E-mail"><p style="color:#ccc">texto claro</p>'
    r = await auditar(browser, ruim)
    ids = [v["id"] for v in r["violacoes"]]
    assert "image-alt" in ids, "deveria acusar imagem sem alt"
    # O axe aceita placeholder como nome acessível; quem acusa é a nossa checagem própria.
    assert "label" not in ids
    assert "rotulo-visivel" in ids, "deveria acusar campo só com placeholder"
    assert "color-contrast" in ids, "deveria acusar contraste baixo"
    assert r["nota"] == 100 - 25 - 15 - 15


async def test_html_acessivel_tira_100(browser):
    bom = ('<h1>Newsletter</h1><img src="logo.png" alt="Logo da ACME"><label for="e">E-mail</label>'
           '<input id="e" type="email"><p style="color:#595959">texto</p>')
    r = await auditar(browser, bom)
    assert r["violacoes"] == []
    assert r["nota"] == 100


def test_nota_desconta_por_no_afetado_e_por_impacto():
    assert nota([{"impact": "critical", "nodes": ["a", "b"]}, {"impact": "minor", "nodes": ["c"]}]) == 100 - 50 - 3


async def test_div_clicavel_e_acusada_pela_checagem_propria(browser):
    r = await auditar(browser, '<h1>X</h1><div onclick="f()">Enviar</div>')
    assert [v["id"] for v in r["violacoes"]] == ["clicavel-sem-semantica"]


async def test_documento_sem_conteudo_tira_0_nao_100(browser):
    r = await auditar(browser, "<style>body{color:#333}</style>")
    assert r["elementos"] == 0
    assert r["nota"] == 0
