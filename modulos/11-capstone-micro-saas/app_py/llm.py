"""Adaptador de LLM: a única porta de saída para o provedor. O resto do código recebe um objeto com
`chat`, `embed` e `modelo` por injeção, então os testes trocam por um dublê sem rede."""

import time
from typing import Any

from . import config


class Llm:
    def __init__(self, client=None, modelo: str = config.MODELO_CHAT, modelo_embed: str = config.MODELO_EMBED):
        self.client = client or config.novo_cliente_openai()
        self.modelo = modelo
        self.modelo_embed = modelo_embed

    async def chat(self, messages: list[dict], *, tools: list[dict] | None = None, max_tokens: int = 160,
                   temperature: float = 0) -> dict[str, Any]:
        """Uma chamada de Chat Completions. `tools` é opcional (agent loop)."""
        t0 = time.perf_counter()
        r = await self.client.chat.completions.create(
            model=self.modelo,
            messages=messages,
            **({"tools": tools} if tools else {}),
            temperature=temperature,
            max_tokens=max_tokens,
            **config.EXTRAS_PROVEDOR,
        )
        uso = r.usage.model_dump() if r.usage else {}
        return {"msg": r.choices[0].message, "usage": uso, "ms": round((time.perf_counter() - t0) * 1000),
                "finish_reason": r.choices[0].finish_reason}

    async def embed(self, textos: list[str]) -> list[list[float]]:
        """Embeddings em lote: 1 chamada para N textos."""
        r = await self.client.embeddings.create(model=self.modelo_embed, input=textos)
        return [d.embedding for d in r.data]


def criar_llm(**kw) -> Llm:
    return Llm(**kw)
