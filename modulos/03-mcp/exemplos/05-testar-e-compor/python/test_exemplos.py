"""Fumaça dos exemplos Python (equivalente ao `npm test` do JS): roda cada script como o README manda e
confere o código de saída e uma linha-chave. O exemplo 03 (LLM local, lento) fica de fora por padrão:
    RODAR_LLM=1 uv run pytest -k llm
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

MODULO = Path(__file__).resolve().parents[3]

CASOS = {
    "ex01": ("exemplos/01-servidor-stdio/python/client.py", "dia_da_semana -> 2026-10-16 cai numa sexta-feira"),
    "ex02": ("exemplos/02-empresa-como-mcp/python/client.py", "Fatura 999 não existe."),
    "ex04": ("exemplos/04-mcp-http-producao/python/teste.py", "Todos os cenários passaram."),
    "ex05": ("exemplos/05-testar-e-compor/python/compor.py", "-> pode vender"),
    "exe02": ("exercicios/02-escopos-e-limite-por-token/solucao/python/teste.py", "OK: escopos e cotas funcionando."),
}


def rodar(script: str, *args: str) -> str:
    r = subprocess.run([sys.executable, script, *args], cwd=MODULO, capture_output=True, text=True, timeout=900)
    assert r.returncode == 0, r.stderr[-2000:]
    return r.stdout


@pytest.mark.parametrize("nome", CASOS)
def test_exemplo(nome):
    script, esperado = CASOS[nome]
    assert esperado in rodar(script)


@pytest.mark.skipif(os.environ.get("RODAR_LLM") != "1", reason="depende do Ollama (lento em CPU); use RODAR_LLM=1")
def test_llm_ponte_mcp():
    assert "Resposta final:" in rodar("exemplos/03-ponte-mcp-llm/python/agente.py")
