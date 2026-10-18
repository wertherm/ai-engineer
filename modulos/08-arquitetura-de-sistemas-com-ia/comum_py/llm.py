"""Infra única do módulo (versão Python): cliente de LLM, embeddings, Postgres (schema m08) e preços.

Lê as variáveis de infra/.env.example com os mesmos defaults do JS (comum/llm.js): trocar Ollama ->
OpenAI/OpenRouter é só mudar o ambiente, sem tocar no código (Loose Coupling na prática).
"""

import json
import os
import time
from decimal import ROUND_HALF_UP, Decimal

import psycopg
from openai import OpenAI
from pgvector import Vector
from pgvector.psycopg import register_vector

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")
MODELO_EMBED = os.environ.get("MODELO_EMBED", "qwen3-embedding:0.6b")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")

# O Ollama é compartilhado e lento em CPU: timeout alto e sem retry (um retry só dobraria a fila).
client = OpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=900, max_retries=0)

# No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5. Em outro provedor, não mandamos o campo.
EXTRAS_OLLAMA = {"reasoning_effort": "none"} if "11434" in BASE_URL else {}

# Tabela de preços FICTÍCIA (US$ por 1M de tokens). Localmente os dois tiers são o mesmo modelo; muda o
# preço de tabela e o limite de saída. Ajuste via env PRECOS (mesmo formato JSON do JS).
PRECOS = json.loads(os.environ.get("PRECOS", '{"barato":{"in":0.15,"out":0.6},"caro":{"in":3,"out":15}}'))


def custo_usd(tier: str, usage) -> float:
    p = PRECOS.get(tier)
    if not p or not usage:
        return 0.0
    return (usage.prompt_tokens * p["in"] + usage.completion_tokens * p["out"]) / 1_000_000


def ms_desde(t0: float) -> int:
    return arredondar((time.perf_counter() - t0) * 1000)


def arredondar(x: float) -> int:
    """Math.round do JS (empate sobe). O round() do Python arredonda empate para o par."""
    return int(Decimal(x).quantize(Decimal(1), ROUND_HALF_UP))


def fixo(x: float, casas: int) -> str:
    """Number.prototype.toFixed do JS: arredonda o valor binário exato, empate para cima."""
    return str(Decimal(x).quantize(Decimal(1).scaleb(-casas), ROUND_HALF_UP))


def chat(messages, *, tools=None, max_tokens=60, temperature=0) -> dict:
    """Uma chamada de Chat Completions com métricas (latência em ms e tokens)."""
    t0 = time.perf_counter()
    r = client.chat.completions.create(
        model=MODELO_CHAT,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        **({"tools": tools} if tools else {}),
        **EXTRAS_OLLAMA,
    )
    msg = r.choices[0].message
    return {"msg": msg, "texto": (msg.content or "").strip(), "usage": r.usage, "ms": ms_desde(t0)}


def chat_stream(messages, *, max_tokens=60, on_token=lambda t: None) -> dict:
    """Streaming: mede o TTFT (tempo até o 1º token). include_usage pede um último chunk com os tokens."""
    t0 = time.perf_counter()
    stream = client.chat.completions.create(
        model=MODELO_CHAT,
        messages=messages,
        temperature=0,
        max_tokens=max_tokens,
        stream=True,
        stream_options={"include_usage": True},
        **EXTRAS_OLLAMA,
    )
    texto, ttft, usage = "", None, None
    for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            if ttft is None:
                ttft = ms_desde(t0)
            texto += delta
            on_token(delta)
        if chunk.usage:
            usage = chunk.usage
    return {"texto": texto.strip(), "usage": usage, "ttft": ttft, "ms": ms_desde(t0)}


def embed(textos: list[str]) -> list[list[float]]:
    r = client.embeddings.create(model=MODELO_EMBED, input=textos)
    return [d.embedding for d in r.data]


def conectar() -> psycopg.Connection:
    """Conexão autocommit no schema m08 (nunca public), com o tipo vector registrado."""
    conn = psycopg.connect(DATABASE_URL, autocommit=True)
    conn.execute("CREATE SCHEMA IF NOT EXISTS m08")
    register_vector(conn)
    return conn


def vetor(v: list[float]) -> Vector:
    """list[float] -> parâmetro do pgvector (o equivalente ao pgvector.toSql do JS)."""
    return Vector(v)


def tabela(linhas: list[dict]) -> str:
    """Formata linhas como tabela de texto alinhada (mesmo formato do helper JS)."""
    cols = list(linhas[0])
    larg = [max(len(c), *(len(str(l[c])) for l in linhas)) for c in cols]

    def fmt(vals):
        return " | ".join(str(v).ljust(larg[i]) for i, v in enumerate(vals))

    return "\n".join([fmt(cols), "-|-".join("-" * n for n in larg), *(fmt([l[c] for c in cols]) for l in linhas)])
