"""Testes de unidade da API (versão pytest de app.test.js): o LLM é um dublê injetado com
`dependency_overrides`, então rodam em milissegundos, sem rede e de forma determinística.
O TestClient simula HTTP sem abrir porta (equivale ao app.inject() do Fastify).
"""

from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app import criar_app, obter_llm

TOKEN = "segredo-teste"
AUTH = {"authorization": f"Bearer {TOKEN}"}
TEXTO = "O pedido 123 atrasou cinco dias e o cliente pediu reembolso integral do frete."


@pytest.fixture
def llm() -> Mock:
    falso = Mock(modelo="falso")
    falso.resumir.return_value = {"resumo": "Cliente quer reembolso do frete.", "tokens": 42}
    return falso


@pytest.fixture
def cliente(llm: Mock) -> TestClient:
    app = criar_app(TOKEN)
    app.dependency_overrides[obter_llm] = lambda: llm
    return TestClient(app)


def test_200_devolve_o_resumo_do_llm(cliente, llm):
    res = cliente.post("/v1/resumos", headers=AUTH, json={"texto": TEXTO})
    assert res.status_code == 200
    assert res.json() == {"resumo": "Cliente quer reembolso do frete.", "modelo": "falso", "tokens": 42, "versao": "v1"}
    llm.resumir.assert_called_once_with(TEXTO)


def test_401_sem_token_o_llm_nem_e_chamado(cliente, llm):
    res = cliente.post("/v1/resumos", json={"texto": TEXTO})
    assert res.status_code == 401
    llm.resumir.assert_not_called()


def test_401_token_errado(cliente):
    res = cliente.post("/v1/resumos", headers={"authorization": "Bearer outro"}, json={"texto": TEXTO})
    assert res.status_code == 401


def test_422_texto_curto_demais_validacao_antes_de_gastar_tokens(cliente, llm):
    # FastAPI responde 422 (Unprocessable Content) para corpo inválido; o Fastify responde 400.
    res = cliente.post("/v1/resumos", headers=AUTH, json={"texto": "oi"})
    assert res.status_code == 422
    llm.resumir.assert_not_called()


def test_502_falha_do_provedor_vira_bad_gateway(cliente, llm):
    llm.resumir.side_effect = RuntimeError("503 overloaded")
    res = cliente.post("/v1/resumos", headers=AUTH, json={"texto": TEXTO})
    assert res.status_code == 502
    assert "indisponível" in res.json()["detail"]


def test_404_versao_que_nao_existe(cliente):
    res = cliente.post("/v2/resumos", headers=AUTH, json={"texto": TEXTO})
    assert res.status_code == 404


def test_health_responde_sem_token(cliente):
    assert cliente.get("/health").json() == {"status": "ok"}
