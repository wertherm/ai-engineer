"""Configuração única do back-end Python. Tudo vem do ambiente com os MESMOS defaults do JS
(app/src/config.js e infra/.env.example): trocar Ollama -> OpenAI/OpenRouter é só mudar variáveis."""

import os

from openai import AsyncOpenAI

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")
MODELO_EMBED = os.environ.get("MODELO_EMBED", "qwen3-embedding:0.6b")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")
SCHEMA = "m11"  # mesmo schema do módulo; as tabelas da versão Python levam o sufixo _py
PORTA = int(os.environ.get("PORT", 31150))
HOST = os.environ.get("HOST", "127.0.0.1")

# No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5 (senão ele gasta centenas de tokens
# pensando, a ~5 tokens/s em CPU). Em outro provedor não mandamos o parâmetro.
EXTRAS_PROVEDOR = {"reasoning_effort": "none"} if "11434" in BASE_URL else {}



def novo_cliente_openai() -> AsyncOpenAI:
    """Ollama compartilhado e lento: timeout alto e SEM retry (um retry só dobraria a fila).
    O httpx do SDK Python não tem o limite de 300 s de headers do undici, então basta o timeout do SDK.
    É uma FÁBRICA, não um objeto global: o cliente async guarda conexões presas ao event loop em que
    nasceu; um global reaproveitado em outro asyncio.run() falha com "APIConnectionError: Connection error"."""
    return AsyncOpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=900, max_retries=0)
