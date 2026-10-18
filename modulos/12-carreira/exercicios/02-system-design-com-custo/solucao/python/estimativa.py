"""Solução do exercício 02 (Python): triagem de tickets com IA, estimada por etapa.

Cada etapa tem perfil de tokens diferente, então estimamos por etapa (reaproveitando a capacidade.py
do exemplo 05) e somamos. Preços ILUSTRATIVOS (ver capacidade.py).
"""
import sys
from dataclasses import replace
from pathlib import Path

MODULO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(MODULO))  # comum_py
sys.path.insert(0, str(MODULO / "exemplos/05-system-design-rag/python"))  # capacidade (pasta com hífens)
from capacidade import Premissas, estimar  # noqa: E402
from comum_py.formato import fmt  # noqa: E402

# Premissas do enunciado: 400 atendentes × 60 tickets/dia, 8 h de operação, pico 2,5× a média, 22 dias/mês.
COMUM = Premissas(usuarios=400, ativosDia=1, requisicoesPorAtivo=60, horasUteis=8, fatorPico=2.5, diasMes=22,
                  chamadasLLM=1, tokensEntrada=0, tokensSaida=0, fracaoCacheada=0, latenciaS=0)

ETAPAS = {
    # 1) Classificação (categoria + prioridade) em JSON: prompt curto, saída minúscula.
    "classificar": replace(COMUM, chamadasLLM=1, tokensEntrada=600, tokensSaida=30, fracaoCacheada=0.5, latenciaS=1.5),
    # 2) Sugestão de resposta com RAG na base de conhecimento (4 trechos de ~300 tokens).
    "sugerir": replace(COMUM, chamadasLLM=1, tokensEntrada=500 + 4 * 300 + 400, tokensSaida=300, fracaoCacheada=0.2, latenciaS=6),
    # 3) Agente que consulta o status do pedido via tool (MCP) em 30% dos tickets: 2 chamadas extras.
    #    Modelamos como 30% dos tickets: requisicoesPorAtivo × 0,3.
    "agente": replace(COMUM, requisicoesPorAtivo=60 * 0.3, chamadasLLM=2, tokensEntrada=1500, tokensSaida=120, fracaoCacheada=0.3, latenciaS=8),
}


def total() -> dict:
    por_etapa = {k: estimar(p) for k, p in ETAPAS.items()}
    return {
        "por_etapa": por_etapa,
        "custo_mes": sum(e["custo_mes"] for e in por_etapa.values()),
        "tok_s_pico": sum(e["tokens_saida_por_segundo_pico"] for e in por_etapa.values()),
        "tickets_mes": 400 * 60 * 22,
    }


def etapa_mais_cara(t: dict) -> str:
    return max(t["por_etapa"], key=lambda k: t["por_etapa"][k]["custo_mes"])


def main() -> None:
    t = total()
    print("etapa         RPS pico  concorr.  tok/s saída  US$/mês")
    for k, e in t["por_etapa"].items():
        print(f"{k:<13} {fmt(e['rps_pico'], 2):>8}  {fmt(e['concorrencia_pico'], 1):>8}  "
              f"{fmt(e['tokens_saida_por_segundo_pico']):>11}  {fmt(e['custo_mes']):>7}")
    print(f"\nTOTAL: US$ {fmt(t['custo_mes'])} /mês · US$ {fmt(t['custo_mes'] / t['tickets_mes'], 4)} por ticket · {fmt(t['tok_s_pico'])} tok/s de saída no pico")
    print(f'Maior custo: "{etapa_mais_cara(t)}" -> é onde otimizar primeiro (menos trechos, cache, modelo menor se a avaliação deixar).')


if __name__ == "__main__":
    main()
