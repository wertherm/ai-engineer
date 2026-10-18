"""Cliente do LLM do módulo: lê as variáveis de infra/.env.example com os mesmos defaults do JS.

Trocar Ollama -> OpenAI/OpenRouter é só mudar o ambiente, sem tocar no código.
"""
import os
import time

from openai import OpenAI

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")

# Timeout alto: o Ollama em CPU é compartilhado e uma resposta curta pode levar minutos.
_client = OpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=900, max_retries=0)

# No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5. Em outro provedor não mandamos o campo.
_EXTRAS_OLLAMA = {"reasoning_effort": "none"} if "11434" in BASE_URL else {}


def chat(messages, max_tokens=160):
    """Uma chamada curta de Chat Completions; devolve texto, uso de tokens e tempo (ms)."""
    t0 = time.monotonic()
    r = _client.chat.completions.create(
        model=MODELO_CHAT,
        messages=messages,
        temperature=0,
        max_tokens=max_tokens,
        **_EXTRAS_OLLAMA,
    )
    return {
        "texto": r.choices[0].message.content or "",
        "usage": r.usage,
        "ms": (time.monotonic() - t0) * 1000,
    }
