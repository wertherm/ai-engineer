"""Testes de ACEITAÇÃO escritos por um humano a partir da spec (não do código gerado), agora em pytest.
São o "portão": o componente do LLM só entra se passar aqui. O componente (JS) roda no Chrome.

Uso: uv run pytest exemplos/02-ideia-ao-componente-testavel/python/test_aceitacao.py
     COMPONENTE=python/gerado/paginacao.js uv run pytest ...   (testa o que o LLM gerou)
"""

import json
import re

import pytest

from comum_py.componente_js import ErroJS


def test_nav_com_aria_label_e_um_link_por_pagina(renderizar):
    html = renderizar({"paginaAtual": 2, "totalPaginas": 3})
    assert re.search(r'<nav[^>]*aria-label="Paginação"', html)
    for n in (1, 2, 3):
        assert f'href="?pagina={n}"' in html


def test_so_a_pagina_atual_tem_aria_current(renderizar):
    html = renderizar({"paginaAtual": 2, "totalPaginas": 3})
    assert html.count('aria-current="page"') == 1
    assert re.search(r'<a[^>]*href="\?pagina=2"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\?pagina=2"', html)


def test_anterior_desabilitado_na_primeira_e_proxima_na_ultima(renderizar):
    primeira = renderizar({"paginaAtual": 1, "totalPaginas": 3})
    assert re.search(r"<button[^>]*disabled[^>]*>\s*Anterior", primeira)
    assert not re.search(r"<button[^>]*disabled[^>]*>\s*Próxima", primeira)
    ultima = renderizar({"paginaAtual": 3, "totalPaginas": 3})
    assert re.search(r"<button[^>]*disabled[^>]*>\s*Próxima", ultima)


@pytest.mark.parametrize("args", [
    {"paginaAtual": 0, "totalPaginas": 3}, {"paginaAtual": 4, "totalPaginas": 3},
    {"paginaAtual": 1.5, "totalPaginas": 3}, {"paginaAtual": 1, "totalPaginas": 0},
], ids=json.dumps)
def test_range_error_para_entradas_invalidas(renderizar, args):
    with pytest.raises(ErroJS) as e:
        renderizar(args)
    assert e.value.nome == "RangeError"
