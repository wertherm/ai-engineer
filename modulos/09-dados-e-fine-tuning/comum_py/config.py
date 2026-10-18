"""Configuração compartilhada pelos scripts Python do módulo 9 (espelho de `comum/config.js`).

Tudo vem do ambiente com os MESMOS defaults do JS (Ollama + Postgres de infra/): trocar para a OpenAI real
é só exportar outras variáveis.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from openai import OpenAI

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")
SCHEMA = "m09"  # schema exclusivo do módulo; as tabelas do Python têm sufixo _py para não colidir com o JS

# Servidor local (Python) que serve o modelo base e o LoRA no formato OpenAI — exemplo 04.
LORA_BASE_URL = os.environ.get("LORA_BASE_URL", "http://localhost:30900/v1")

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "dados"

# Fonte única do domínio, a mesma lida pelo JS: o MESMO system prompt no dataset, no treino e na inferência.
_dominio = json.loads((RAIZ / "comum" / "dominio.json").read_text(encoding="utf-8"))
CATEGORIAS: list[str] = _dominio["categorias"]
SYSTEM_PROMPT: str = _dominio["system_prompt"]

# No Ollama, reasoning_effort "none" desliga o thinking do qwen3.5 (senão gasta centenas de tokens).
EXTRAS_OLLAMA: dict = {"reasoning_effort": "none"} if "11434" in BASE_URL else {}


def criar_cliente(base_url: str = BASE_URL, api_key: str = API_KEY) -> OpenAI:
    """Cliente OpenAI com prazo longo e sem retry: o Ollama é compartilhado e lento em CPU.

    Diferente do Node (fetch nativo corta em 300 s), o httpx do SDK Python respeita o `timeout` inteiro.
    """
    return OpenAI(base_url=base_url, api_key=api_key, timeout=900, max_retries=0)


def ler_jsonl(caminho: Path) -> list[dict]:
    return [json.loads(l) for l in caminho.read_text(encoding="utf-8").splitlines() if l.strip()]


def json_js(obj, indent: int | None = None) -> str:
    """Serializa como o JSON.stringify do JS: UTF-8 cru (sem \\uXXXX) e sem espaços após `,` e `:`."""
    if indent is None:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(obj, ensure_ascii=False, indent=indent)
