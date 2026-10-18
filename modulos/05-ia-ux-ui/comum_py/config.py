"""Configuração compartilhada pela versão Python do módulo 05 (espelha comum/config.js).

Tudo vem do ambiente com defaults locais (Ollama + Postgres de infra/): trocar para a OpenAI ou o
OpenRouter é só exportar outras variáveis, o código não muda.
"""

import os
import re
import time
from dataclasses import dataclass
from typing import Any

from openai import OpenAI

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")
MODELO_EMBED = os.environ.get("MODELO_EMBED", "qwen3-embedding:0.6b")
# psycopg aceita a URL postgres:// direto (o mesmo default do JS).
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")
SCHEMA = "m05"  # schema exclusivo do módulo; a versão Python usa tabelas com sufixo _py

# Sem thinking e sem aleatoriedade. reasoning_effort é parâmetro de primeira classe no SDK Python.
PADRAO: dict[str, Any] = {"reasoning_effort": "none", "temperature": 0, "seed": 42}


def criar_cliente(**opcoes: Any) -> OpenAI:
    # O Ollama é compartilhado e enfileira: timeout alto (900 s, ajustável) e sem retry (um retry só
    # dobraria a fila). O httpx do SDK Python não tem o corte de 300 s nos headers do fetch do Node.
    timeout = float(os.environ.get("LLM_TIMEOUT_MS", 900_000)) / 1000
    return OpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=timeout, max_retries=0, **opcoes)


@dataclass
class Resposta:
    texto: str
    segundos: int
    tokens: int | None
    fim: str | None  # finish_reason: "length" = cortada por max_tokens


def conversar(cliente: OpenAI, mensagens: list[dict], max_tokens: int = 400) -> Resposta:
    """Uma chamada de chat curta, com medição de tempo (o custo em CPU fica visível)."""
    inicio = time.monotonic()
    r = cliente.chat.completions.create(model=MODELO_CHAT, messages=mensagens, max_tokens=max_tokens, **PADRAO)
    escolha = r.choices[0]
    return Resposta(
        texto=escolha.message.content or "",
        segundos=round(time.monotonic() - inicio),
        tokens=r.usage.completion_tokens if r.usage else None,
        fim=escolha.finish_reason,
    )


def extrair_codigo(texto: str, linguagem: str = "") -> str:
    """Extrai o 1º bloco ```lang ... ``` (modelos pequenos embrulham o código em cercas)."""
    m = re.search(r"```" + linguagem + r"[a-z]*\n([\s\S]*?)```", texto, re.I) or re.search(r"```[a-z]*\n([\s\S]*?)```", texto, re.I)
    if m:
        return m.group(1).strip()
    # Resposta cortada por max_tokens: tem a cerca de abertura mas não a de fechamento.
    return re.sub(r"```\s*$", "", re.sub(r"^```[a-z]*\n?", "", texto, flags=re.I)).strip()
