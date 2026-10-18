"""Model Router por intenção/complexidade + definição dos tiers (Model Tiering).

Regra de ouro: o roteador tem de ser MUITO mais barato que a diferença de preço entre os tiers; por isso
é uma heurística determinística (microssegundos, custo zero).
"""

import re

TIERS = {
    # Localmente é o mesmo modelo; num provedor real, troque por um mini × um flagship.
    "barato": {"max_tokens": 40, "sistema": "Você é um assistente financeiro. Responda em UMA frase curta, em português."},
    "caro": {"max_tokens": 120, "sistema": "Você é um consultor financeiro sênior. Responda em português, em até 4 tópicos curtos."},
}

# re.ASCII: \b igual ao do JS.
SINAIS_COMPLEXIDADE = re.compile(r"\b(compar|diferen[cç]a|prós|contras|vantage|estrat[eé]gi|analis|por que|devo)",
                                 re.IGNORECASE | re.ASCII)


def rotear(pergunta: str) -> tuple[str, str]:
    """Devolve (tier, motivo). Intent-Based Routing: a intenção (comparar/analisar × definir) decide o tier."""
    if SINAIS_COMPLEXIDADE.search(pergunta):
        return "caro", "intenção analítica"
    if len(re.split(r"\s+", pergunta)) > 25:
        return "caro", "pergunta longa"
    return "barato", "pergunta factual curta"
