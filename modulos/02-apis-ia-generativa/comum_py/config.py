"""Configuração compartilhada pelos exemplos Python do módulo 2 (espelha comum/config.js).

Tudo vem do ambiente com defaults locais (Ollama + Postgres do infra/), então trocar para a OpenAI ou o
OpenRouter é só exportar outras variáveis — o código não muda.
"""

import os
from pathlib import Path

from openai import OpenAI

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")
MODELO_EMBED = os.environ.get("MODELO_EMBED", "qwen3-embedding:0.6b")
# psycopg aceita a URL no formato postgres:// (mesmo default do JS).
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")
SCHEMA = "m02"  # schema exclusivo deste módulo no Postgres compartilhado

# Cache dos modelos locais da versão Python (OCR, Whisper, tiktoken). Fica DENTRO do .venv (ignorado pelo
# git) e não em .cache/: o Hugging Face Hub deixa arquivos .lock vazios, que o validador do repo acusa.
# Efeito colateral: `rm -rf .venv` também apaga os modelos (são baixados de novo na próxima execução).
RAIZ_MODULO = Path(__file__).resolve().parent.parent
CACHE = RAIZ_MODULO / ".venv" / "cache-modelos"

# Parâmetros "previsíveis" para o modelo local: sem thinking e sem aleatoriedade.
# reasoning_effort "none" desliga o modo de raciocínio do qwen3.5 (senão ele gasta centenas de tokens
# "pensando" antes de responder, o que em CPU custa minutos).
PADRAO = {"reasoning_effort": "none", "temperature": 0, "seed": 42}


def criar_cliente(**opcoes) -> OpenAI:
    """Cliente OpenAI apontado para o BASE_URL.

    timeout generoso: em CPU, com outros processos usando o Ollama, uma chamada pode levar minutos.
    max_retries=0: quem decide se e como tentar de novo é o código (ver exemplo 03), não o SDK.
    Diferente do Node, o httpx do SDK Python não tem um corte próprio de 300 s: o `timeout` vale.
    """
    return OpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=900, max_retries=0, **opcoes)
