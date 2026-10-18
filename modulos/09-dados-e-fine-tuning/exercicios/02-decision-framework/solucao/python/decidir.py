"""Solução do exercício 02 em Python (porta de `../decidir.js`): decision framework (prompt × RAG × fine-tuning ×
modelo maior) aplicado a 3 casos, com regras explícitas e custo mensal estimado (preços de 2026-10-16).
Uso (da pasta do módulo): uv run python exercicios/02-decision-framework/solucao/python/decidir.py
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from comum_py.numeros import to_fixed  # noqa: E402

# US$ por 1M tokens (https://developers.openai.com/api/docs/pricing). "ft" = modelo fine-tunado.
P = {
    "pequeno": {"in": 0.1, "out": 0.4},  # gpt-4.1-nano
    "pequeno_ft": {"in": 0.2, "out": 0.8, "treino": 1.5},
    "maior": {"in": 2.0, "out": 8.0},  # gpt-4.1
}


@dataclass(frozen=True)
class Caso:
    nome: str
    conhecimento_muda: bool
    precisa_citar_fonte: bool
    formato_rigido: bool
    tarefa_estreita: bool
    exemplos_rotulados: int
    chamadas_mes: int
    tokens_entrada: int
    tokens_saida: int
    raciocinio_complexo: bool


casos = [
    Caso("Jurídico: responder dúvidas sobre 3.000 contratos que mudam toda semana",
         True, True, False, False, 0, 20_000, 400, 300, False),
    Caso("Suporte: classificar 300 mil tickets/mês em 5 categorias, com latência baixa",
         False, False, True, True, 5_000, 300_000, 80, 3, False),
    Caso("Financeiro: parecer de crédito com análise de 10 indicadores, 500 casos/mês",
         False, False, False, False, 40, 500, 3_000, 800, True),
]

PROMPT, RAG, FT, MAIOR = ("prompt (modelo pequeno + few-shot)", "RAG (modelo pequeno + 2k tokens de contexto)",
                          "fine-tuning (pequeno ajustado)", "modelo maior (sem ajuste)")


def custo(p: dict, c: Caso, extra_entrada: int = 0) -> float:
    return c.chamadas_mes * ((c.tokens_entrada + extra_entrada) * p["in"] + c.tokens_saida * p["out"]) / 1e6


def decidir(c: Caso) -> tuple[str, str, dict[str, float]]:
    opcoes = {
        PROMPT: custo(P["pequeno"], c, 600),
        RAG: custo(P["pequeno"], c, 2_000) + (5 if c.conhecimento_muda else 0),
        FT: custo(P["pequeno_ft"], c) + c.exemplos_rotulados * 150 * 3 * P["pequeno_ft"]["treino"] / 1e6,
        MAIOR: custo(P["maior"], c, 600),
    }
    # As regras seguem a ordem do doc 01: comece barato e só suba de degrau com motivo.
    if c.conhecimento_muda or c.precisa_citar_fonte:
        return RAG, "conhecimento muda e precisa de fonte: pesos congelam o conhecimento, o RAG atualiza no índice", opcoes
    if c.tarefa_estreita and c.formato_rigido and c.exemplos_rotulados >= 100 and c.chamadas_mes >= 50_000:
        return FT, "tarefa estreita, formato rígido, muitos exemplos e alto volume: o prompt encurta e o modelo pequeno basta", opcoes
    if c.raciocinio_complexo and c.chamadas_mes < 10_000:
        return MAIOR, "raciocínio complexo com volume baixo e poucos exemplos: pagar mais por chamada sai mais barato que montar dataset", opcoes
    return PROMPT, "nenhum sinal forte: comece pelo prompt e meça antes de investir", opcoes


for c in casos:
    escolha, motivo, opcoes = decidir(c)
    print(f"\n{c.nome}\n  -> {escolha}\n     porquê: {motivo}")
    for o, v in opcoes.items():
        print(f"     {'*' if o == escolha else ' '} {o.ljust(46)} US$ {to_fixed(v, 2)}/mês")
print("\n(* = escolhida; custo não é o único critério: dados disponíveis, manutenção e risco pesam)")
