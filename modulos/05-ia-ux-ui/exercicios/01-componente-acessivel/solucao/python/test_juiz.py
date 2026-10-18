"""Sem LLM: o componente original tira 0 e a versão corrigida registrada do JS tira 100 no juiz Python
(prova que o juiz Python e o JS concordam). Uso: uv run pytest exercicios/01-componente-acessivel"""

from pathlib import Path

import pytest

from comum_py.acessibilidade import auditar
from comum_py.navegador import abrir_navegador, fechar_navegador

pytestmark = pytest.mark.anyio
EXERCICIO = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
async def browser():
    pw, b = await abrir_navegador()
    yield b
    await fechar_navegador(pw, b)


async def test_original_tira_0_com_as_5_regras(browser):
    a = await auditar(browser, (EXERCICIO / "componente-ruim.html").read_text())
    assert a["nota"] == 0
    assert sorted(v["id"] for v in a["violacoes"]) == ["button-name", "clicavel-sem-semantica", "color-contrast",
                                                         "image-alt", "rotulo-visivel"]


async def test_correcao_registrada_do_js_tira_100(browser):
    a = await auditar(browser, (EXERCICIO / "solucao" / "saida" / "componente-corrigido.html").read_text())
    assert a["nota"] == 100
