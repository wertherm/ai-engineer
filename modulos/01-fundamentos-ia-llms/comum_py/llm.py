"""Cliente único para os exemplos Python: mesmas variáveis e defaults de infra/.env.example (e de lib/llm.js).

Trocar Ollama -> OpenAI/OpenRouter é só mudar o ambiente, sem tocar no código.
"""

import os
import time
from dataclasses import dataclass

from openai import OpenAI

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")
MODELO_EMBED = os.environ.get("MODELO_EMBED", "qwen3-embedding:0.6b")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")

# O Ollama é compartilhado e lento em CPU: timeout alto e sem retry (um retry só dobraria a fila).
client = OpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=900, max_retries=0)

# Ollama local: reasoning_effort "none" desliga o "thinking" do qwen3.5 (senão ele gasta
# centenas de tokens pensando antes de responder, a ~5 tokens/s em CPU).
EXTRAS_OLLAMA = {"reasoning_effort": "none"} if "11434" in BASE_URL else {}


@dataclass
class Resposta:
    texto: str
    prompt_tokens: int
    completion_tokens: int
    ms: float
    finish_reason: str


def chat(messages: list[dict], max_tokens: int = 80, temperature: float = 0) -> Resposta:
    t0 = time.perf_counter()
    r = client.chat.completions.create(
        model=MODELO_CHAT,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        **EXTRAS_OLLAMA,
    )
    return Resposta(
        texto=r.choices[0].message.content or "",
        prompt_tokens=r.usage.prompt_tokens,
        completion_tokens=r.usage.completion_tokens,
        ms=(time.perf_counter() - t0) * 1000,
        finish_reason=r.choices[0].finish_reason,
    )


def embed(textos: list[str]) -> list[list[float]]:
    r = client.embeddings.create(model=MODELO_EMBED, input=textos)
    return [d.embedding for d in r.data]
