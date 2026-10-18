"""Contagem de tokens de uma conversa no formato chat (espelho de `comum/tokens.js`).

`tiktoken` é a biblioteca oficial da OpenAI; o `js-tiktoken` do JS é a porta dela, com o mesmo `o200k_base`
(codificação dos modelos gpt-4o/gpt-4.1) — as contagens batem token a token.
"""
from __future__ import annotations

import os
from pathlib import Path

# O tiktoken baixa o arquivo da codificação (~3,6 MB) na 1ª vez e, por padrão, guarda num diretório
# temporário do sistema. Fixamos dentro do .venv do módulo (ignorado pelo git), como o cache do Hugging Face.
os.environ.setdefault("TIKTOKEN_CACHE_DIR", str(Path(__file__).resolve().parent.parent / ".venv" / "tiktoken"))

import tiktoken  # noqa: E402

_enc = tiktoken.get_encoding("o200k_base")

# Fórmula do cookbook da OpenAI: ~3 tokens de "moldura" por mensagem + 3 que preparam a resposta. ESTIMATIVA.
TOKENS_POR_MENSAGEM = 3
TOKENS_RESPOSTA = 3


def tokens_do_texto(texto: str) -> int:
    # Como no js-tiktoken, um "<|endoftext|>" literal no texto levanta erro (tokens especiais não são texto).
    return len(_enc.encode(texto))


def tokens_da_conversa(messages: list[dict]) -> int:
    n = TOKENS_RESPOSTA
    for m in messages:
        n += TOKENS_POR_MENSAGEM + tokens_do_texto(m["role"]) + tokens_do_texto(m.get("content") or "")
    return n
