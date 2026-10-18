"""Cliente OpenAI único para os exemplos Python: mesmas variáveis e defaults de infra/.env.example.

Trocar Ollama -> OpenAI/OpenRouter é só mudar o ambiente, sem tocar no código.
"""

import os

from openai import OpenAI

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")

# O Ollama é compartilhado e lento em CPU: timeout alto e sem retry (um retry só dobraria a fila).
client = OpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=900, max_retries=0)
