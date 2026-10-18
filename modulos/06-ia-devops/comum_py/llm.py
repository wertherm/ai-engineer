"""Cliente único do módulo (versão Python): lê as variáveis de infra/.env.example com os mesmos defaults do JS.

Trocar Ollama -> OpenAI/OpenRouter/Bedrock (via gateway compatível) é só mudar o ambiente.
"""
import json
import os
import re
import time

import numpy as np
import psycopg
from openai import OpenAI
from pgvector.psycopg import register_vector

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")
MODELO_EMBED = os.environ.get("MODELO_EMBED", "qwen3-embedding:0.6b")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")

# Ollama em CPU e compartilhado: uma resposta pode levar vários minutos. O httpx do SDK Python não tem o
# corte de 300 s nos headers que o fetch do Node tem, então basta o timeout do próprio SDK.
# max_retries=0: retry automático em LLM lento só duplica a fila.
client = OpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=900, max_retries=0)

# No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5. Em outro provedor, não mandamos.
EXTRAS_OLLAMA = {"reasoning_effort": "none"} if "11434" in BASE_URL else {}

# Contadores do processo: todo exemplo imprime quantas chamadas e tokens gastou.
uso = {"chamadas": 0, "prompt_tokens": 0, "completion_tokens": 0, "ms": 0.0}


def chat(messages, tools=None, max_tokens=200, temperature=0, json_mode=False):
    """Uma chamada de Chat Completions (com ou sem tools). Devolve (mensagem, ms, finish_reason)."""
    t0 = time.monotonic()
    extras = dict(EXTRAS_OLLAMA)
    if tools:
        extras["tools"] = tools
    if json_mode:
        extras["response_format"] = {"type": "json_object"}
    r = client.chat.completions.create(
        model=MODELO_CHAT, messages=messages, temperature=temperature, max_tokens=max_tokens, **extras
    )
    ms = (time.monotonic() - t0) * 1000
    uso["chamadas"] += 1
    if r.usage:
        uso["prompt_tokens"] += r.usage.prompt_tokens or 0
        uso["completion_tokens"] += r.usage.completion_tokens or 0
    uso["ms"] += ms
    return r.choices[0].message, ms, r.choices[0].finish_reason


def embed(textos):
    r = client.embeddings.create(model=MODELO_EMBED, input=textos)
    return [np.array(d.embedding) for d in r.data]


def conectar():
    """Conexão psycopg 3 (autocommit) com o schema m06 garantido e o tipo vector registrado. Nunca use public."""
    conn = psycopg.connect(DATABASE_URL, autocommit=True)
    conn.execute("CREATE SCHEMA IF NOT EXISTS m06")
    register_vector(conn)
    return conn


def resumo_uso():
    return (
        f"{uso['chamadas']} chamadas ao LLM · {uso['prompt_tokens']} tokens de prompt · "
        f"{uso['completion_tokens']} de resposta · {uso['ms'] / 1000:.1f}s no modelo"
    )


def tirar_cercas(texto):
    """Remove cercas ``` que modelos pequenos insistem em colocar em volta de código."""
    texto = texto or ""
    m = re.search(r"```[a-zA-Z0-9]*\n([\s\S]*?)```", texto)
    return (m.group(1) if m else texto).strip() + "\n"


def extrair_json(texto):
    """Extrai um objeto/array JSON de um texto (com ou sem cercas)."""
    limpo = re.sub(r"```(?:json)?", "", texto or "").strip()
    m = re.search(r"[\[{]", limpo)
    if not m:
        raise ValueError(f"sem JSON na resposta: {texto}")
    ini = m.start()
    fecha = "]" if limpo[ini] == "[" else "}"
    return json.loads(limpo[ini : limpo.rfind(fecha) + 1])
