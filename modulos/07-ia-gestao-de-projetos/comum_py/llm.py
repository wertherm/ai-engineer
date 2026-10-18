"""Cliente LLM compartilhado pelos exemplos Python do módulo (equivalente a lib/llm.js).

Lê as mesmas variáveis do infra/.env.example: trocar Ollama por OpenAI/OpenRouter é só mudar o ambiente.
"""
import os

from openai import OpenAI
from pydantic import BaseModel

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
MODELO = os.environ.get("MODELO_CHAT", "qwen3.5:4b")

# Timeout alto e sem retry: o Ollama em CPU é compartilhado (~5 tokens/s) e repetir só dobra a fila.
client = OpenAI(
    base_url=BASE_URL,
    api_key=os.environ.get("OPENAI_API_KEY", "ollama"),
    timeout=900,
    max_retries=0,
)

# Só no Ollama: desliga o "thinking" do qwen3.5 (senão gasta centenas de tokens pensando).
_EXTRAS = {"reasoning_effort": "none"} if "11434" in BASE_URL else {}


def extrair_json[T: BaseModel](schema: type[T], system: str, user: str, max_tokens: int = 600) -> T:
    """Pede ao LLM um JSON que obedeça ao modelo pydantic (structured output).

    O SDK converte o pydantic em JSON Schema estrito, o servidor restringe a geração
    e o SDK valida de novo na volta (equivalente ao zodResponseFormat do JS).
    """
    resp = client.chat.completions.parse(
        model=MODELO,
        temperature=0,
        max_tokens=max_tokens,
        response_format=schema,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        **_EXTRAS,
    )
    escolha = resp.choices[0]
    if escolha.finish_reason == "length":
        raise RuntimeError(f"Resposta cortada em {max_tokens} tokens: aumente max_tokens ou peça menos itens.")
    # .parsed já passou por schema.model_validate_json(); se o JSON não bater, o SDK lança erro antes daqui.
    return escolha.message.parsed


def gerar_texto(system: str, user: str, max_tokens: int = 200) -> str:
    """Texto livre curto (justificativas, resumos)."""
    resp = client.chat.completions.create(
        model=MODELO,
        temperature=0,
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        **_EXTRAS,
    )
    return (resp.choices[0].message.content or "").strip()
