"""Solução do exercício 01 (Python) · Roteador com 3 tiers + política de orçamento.

Model Tiering + Policy-Driven Control: parte do roteador do exemplo 05 e acrescenta o tier "medio" e a
degradação por orçamento mensal.
"""

import re

from comum_py.llm import fixo

TIERS = {
    "barato": {"preco_in": 0.15, "preco_out": 0.6, "max_tokens": 40},
    "medio": {"preco_in": 0.8, "preco_out": 3.2, "max_tokens": 80},
    "caro": {"preco_in": 3, "preco_out": 15, "max_tokens": 120},
}
ORDEM = ["barato", "medio", "caro"]

# A política é dado (pode vir de um arquivo versionado), não if espalhado.
POLITICA_PADRAO = {"orcamento_mes_usd": 5, "alerta_pct": 0.8}

_F = re.IGNORECASE | re.ASCII  # \b igual ao do JS
_ANALITICA = re.compile(r"\b(compar|estrat[eé]gi|analis|prós|contras|plano)", _F)
_EXPLICATIVA = re.compile(r"\b(explique|como funciona|por que|diferen[cç]a)", _F)


def tier_ideal(pergunta: str) -> str:
    """Tier "ideal" pela intenção/complexidade, ignorando orçamento."""
    if _ANALITICA.search(pergunta):
        return "caro"
    if _EXPLICATIVA.search(pergunta) or len(re.split(r"\s+", pergunta)) > 15:
        return "medio"
    return "barato"


def rotear(pergunta: str, gasto_mes_usd: float, politica: dict = POLITICA_PADRAO) -> tuple[str | None, str]:
    """Decide (tier | None, motivo) considerando o orçamento:
      - gasto < alerta (80%)     -> tier ideal
      - alerta <= gasto < 100%   -> desce UM degrau (caro->medio, medio->barato); barato continua barato
      - gasto >= 100%            -> recusa (o produto decide: fila, mensagem amigável, upgrade de plano)
    """
    ideal = tier_ideal(pergunta)
    uso = gasto_mes_usd / politica["orcamento_mes_usd"]
    if uso >= 1:
        return None, "orçamento esgotado"
    if uso >= politica["alerta_pct"]:
        rebaixado = ORDEM[max(0, ORDEM.index(ideal) - 1)]
        return rebaixado, "já no tier mínimo" if rebaixado == ideal else f"rebaixado de {ideal} (uso {fixo(uso * 100, 0)}%)"
    return ideal, "tier ideal"


def custo(tier: str, tokens_in: int, tokens_out: int) -> float:
    return (tokens_in * TIERS[tier]["preco_in"] + tokens_out * TIERS[tier]["preco_out"]) / 1e6
