"""Teste de integração: API + LLM REAL (Ollama). Lento e não determinístico no texto, então só roda com
INTEGRACAO=1 e verifica PROPRIEDADES, não a frase exata (versão pytest de integracao.test.js).
"""

import os
import re

import pytest
from fastapi.testclient import TestClient

from app import criar_app

pytestmark = [
    pytest.mark.integracao,
    pytest.mark.skipif(not os.environ.get("INTEGRACAO"), reason="defina INTEGRACAO=1 para chamar o LLM real"),
]


def test_resume_um_texto_de_verdade():
    cliente = TestClient(criar_app("t"))  # sem override: usa obter_llm() → LLM real
    res = cliente.post(
        "/v1/resumos",
        headers={"authorization": "Bearer t"},
        json={"texto": "A reunião de hoje decidiu adiar o lançamento do aplicativo para março, "
                       "porque os testes de segurança ainda não terminaram."},
    )
    assert res.status_code == 200
    corpo = res.json()
    print("resposta real:", corpo)
    assert 10 < len(corpo["resumo"]) < 300
    assert re.search(r"lançamento|adiad|março", corpo["resumo"].lower())
    assert corpo["tokens"] > 0
