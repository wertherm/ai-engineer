"""Simula um mês de tráfego (sem LLM: tokens estimados) e compara três políticas de roteamento.

Determinístico (gerador congruencial linear com semente) e com a MESMA sequência do JS: lá a conta é feita em
double (semente * 1103515245 passa de 2^53 e perde precisão), então aqui também fazemos em float, não em int.
"""

from roteador import POLITICA_PADRAO, TIERS, custo, rotear, tier_ideal

from comum_py.llm import arredondar, fixo, tabela

semente = 42.0


def aleatorio() -> float:
    global semente
    semente = (semente * 1103515245.0 + 12345.0) % 2.0**31  # float, como o Number do JS
    return semente / 2**31


MODELOS_DE_PERGUNTA = ["Qual a taxa hoje?", "Explique como funciona a antecipação de recebíveis",
                       "Compare CCB e antecipação para minha loja com prós e contras"]


def sortear() -> str:
    r = aleatorio()
    return MODELOS_DE_PERGUNTA[0 if r < 0.6 else 1 if r < 0.9 else 2]  # 60% simples, 30% médias, 10% complexas


pedidos = [sortear() for _ in range(30000)]


def tokens_saida(tier: str) -> int:
    return arredondar(TIERS[tier]["max_tokens"] * 0.8)


def rodar(nome: str, escolher) -> dict:
    gasto, recusados = 0.0, 0
    por_tier = {"barato": 0, "medio": 0, "caro": 0}
    for p in pedidos:
        tier = escolher(p, gasto)
        if not tier:
            recusados += 1
            continue
        por_tier[tier] += 1
        gasto += custo(tier, 60, tokens_saida(tier))
    return {"politica": nome, "gastoUSD": fixo(gasto, 2), "recusados": recusados, **por_tier}


resultados = [
    rodar("tudo no caro", lambda p, g: "caro"),
    rodar("só tier ideal", lambda p, g: tier_ideal(p)),
    rodar("ideal + orçamento", lambda p, g: rotear(p, g)[0]),
]
print(f"Orçamento: US$ {POLITICA_PADRAO['orcamento_mes_usd']}/mês · alerta em {fixo(POLITICA_PADRAO['alerta_pct'] * 100, 0)}% "
      f"· {len(pedidos)} pedidos")
print(tabela(resultados))
