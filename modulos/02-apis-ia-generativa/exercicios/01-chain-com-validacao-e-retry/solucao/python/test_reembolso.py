"""Testa a lógica de validação/retry com um cliente falso: rápido e determinístico (versão pytest)."""

import json
from types import SimpleNamespace
from unittest.mock import Mock

from reembolso import Reembolso, decidir, extrair

TEXTO = "Ana Reis, jantar em 05/10, R$ 45,90."
VALIDO = json.dumps({"colaborador": "Ana Reis", "valor": 45.9, "categoria": "alimentacao", "data": "2026-10-05"})


def cliente_falso(respostas: list[str]) -> Mock:
    """Dublê do SDK: devolve as respostas da lista, uma por chamada (como mockResolvedValueOnce)."""
    cliente = Mock()
    cliente.chat.completions.create.side_effect = [
        SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=r))]) for r in respostas
    ]
    return cliente


def test_aceita_de_primeira_quando_o_json_e_valido():
    r = extrair(cliente_falso([VALIDO]), TEXTO)
    assert r["ok"] and r["tentativas"] == 1


def test_refaz_com_feedback_quando_a_data_vem_no_formato_errado():
    ruim = json.dumps({"colaborador": "Ana Reis", "valor": 45.9, "categoria": "alimentacao", "data": "05/10/2026"})
    c = cliente_falso([ruim, VALIDO])
    r = extrair(c, TEXTO)
    assert r["ok"] and r["tentativas"] == 2
    msgs = c.chat.completions.create.call_args_list[1].kwargs["messages"]
    assert "data:" in msgs[-1]["content"] and "05/10/2026" in msgs[-1]["content"]


def test_rejeita_valor_que_nao_esta_no_texto_alucinacao():
    inventado = json.dumps({"colaborador": "Ana Reis", "valor": 99, "categoria": "alimentacao", "data": "2026-10-05"})
    r = extrair(cliente_falso([inventado] * 3), TEXTO)
    assert r == {"ok": False, "status": "revisao_humana", "erro": "valor 99 não aparece no texto", "tentativas": 3}


def test_sobrevive_a_json_quebrado():
    assert extrair(cliente_falso(["{ isso não é json", VALIDO]), TEXTO)["ok"]


def test_decidir_aplica_o_limite_por_categoria():
    base = {"colaborador": "X Y", "data": "2026-10-01"}
    assert decidir(Reembolso(**base, valor=187, categoria="transporte"))["decisao"] == "negado"
    assert decidir(Reembolso(**base, valor=62.4, categoria="alimentacao"))["decisao"] == "aprovado"
