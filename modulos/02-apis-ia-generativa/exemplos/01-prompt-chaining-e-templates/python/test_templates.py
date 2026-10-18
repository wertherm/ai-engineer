"""Templates são código: dá para testar sem chamar o LLM (versão pytest de templates.test.js)."""

import pytest

from templates import TEMPLATES, mensagens, renderizar


def test_substitui_as_variaveis():
    assert renderizar("Olá {{nome}}!", {"nome": "Ana"}) == "Olá Ana!"


def test_falha_cedo_quando_falta_variavel():
    with pytest.raises(KeyError, match="pedido"):
        renderizar("Pedido {{pedido}}", {})


def test_monta_system_e_user():
    m = mensagens(TEMPLATES["classificar"], {"produto": "fone", "problema": "sem cabo", "prazo": "sexta"})
    assert len(m) == 2
    assert "Produto: fone" in m[1]["content"]
