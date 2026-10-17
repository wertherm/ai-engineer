"""Avaliação offline: cada caso do casos.yaml vira um teste do pytest.

Rodar:  uv run pytest exemplos/05-avaliacao-com-pytest -v
Ideia de LLMOps: nenhum prompt/modelo novo vai para produção sem passar nesta suíte.
"""
import json
import os
from pathlib import Path

import pytest
import yaml
from openai import OpenAI

DADOS = yaml.safe_load((Path(__file__).parent / "casos.yaml").read_text())
client = OpenAI(base_url=os.getenv("VLLM_URL", "http://localhost:8000") + "/v1", api_key="local")


def perguntar(pergunta: str) -> str:
    r = client.chat.completions.create(
        model="qwen-mini",
        messages=[
            {"role": "system", "content": DADOS["prompt_sistema"]},
            {"role": "user", "content": pergunta},
        ],
        temperature=0,  # avaliação precisa ser reprodutível
        max_tokens=80,
    )
    return r.choices[0].message.content


def parametro(caso: dict):
    marcas = [pytest.mark.xfail(reason=caso["falha_conhecida"], strict=False)] if "falha_conhecida" in caso else []
    return pytest.param(caso, id=caso["id"], marks=marcas)


@pytest.mark.parametrize("caso", [parametro(c) for c in DADOS["casos"]])
def test_caso(caso):
    resposta = perguntar(caso["pergunta"])

    for trecho in caso.get("deve_conter", []):
        assert trecho.lower() in resposta.lower(), f"esperava {trecho!r} em: {resposta!r}"

    for trecho in caso.get("nao_deve_conter", []):
        assert trecho.lower() not in resposta.lower(), f"não devia conter {trecho!r}: {resposta!r}"

    if caso.get("formato") == "json":
        # modelos costumam embrulhar o JSON em ```json ... ```: tiramos a cerca antes de validar
        bruto = resposta.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        dados = json.loads(bruto)
        for chave in caso["chaves"]:
            assert chave in dados, f"faltou a chave {chave!r} em {dados}"
