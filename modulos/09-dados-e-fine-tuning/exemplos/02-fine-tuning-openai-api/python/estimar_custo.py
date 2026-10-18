"""Estimativa de tokens e custo de um fine-tuning na OpenAI ANTES de gastar um centavo (porta de `../estimar-custo.js`).

100% local: conta tokens com `tiktoken` (o200k_base, o mesmo do js-tiktoken) e multiplica pela tabela de preços.
Uso (da pasta do módulo): uv run python exemplos/02-fine-tuning-openai-api/python/estimar_custo.py [epocas] [tickets_por_mes]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from comum_py.config import DADOS, SYSTEM_PROMPT, ler_jsonl  # noqa: E402
from comum_py.numeros import js_round, to_fixed  # noqa: E402
from comum_py.tabela import tabela  # noqa: E402
from comum_py.tokens import tokens_da_conversa, tokens_do_texto  # noqa: E402

# US$ por 1M de tokens, de https://developers.openai.com/api/docs/pricing em 2026-10-16 (os mesmos do JS).
# "treino" é cobrado por token treinado (tokens do arquivo × épocas).
PRECOS = {
    "gpt-4.1-2025-04-14": {"treino": 25.0, "ft_input": 3.0, "ft_output": 12.0, "base_input": 2.0, "base_output": 8.0},
    "gpt-4.1-mini-2025-04-14": {"treino": 5.0, "ft_input": 0.8, "ft_output": 3.2, "base_input": 0.4, "base_output": 1.6},
    "gpt-4.1-nano-2025-04-14": {"treino": 1.5, "ft_input": 0.2, "ft_output": 0.8, "base_input": 0.1, "base_output": 0.4},
}

epocas = int(sys.argv[1]) if len(sys.argv) > 1 else 3  # a OpenAI escolhe "auto"; 3 é um palpite comum
tickets_mes = int(sys.argv[2]) if len(sys.argv) > 2 else 100_000

treino = ler_jsonl(DADOS / "treino.jsonl")
validacao = ler_jsonl(DADOS / "validacao.jsonl")
tok_treino = sum(tokens_da_conversa(ex["messages"]) for ex in treino)
tok_valid = sum(tokens_da_conversa(ex["messages"]) for ex in validacao)

# Na inferência, o fine-tunado só precisa do system prompt curto + ticket (o "jeito" já está nos pesos).
media_ticket = sum(tokens_do_texto(ex["messages"][1]["content"]) for ex in treino) / len(treino)
input_ft = tokens_do_texto(SYSTEM_PROMPT) + media_ticket + 10
# O genérico precisaria de few-shot: o mesmo prompt + 20 exemplos rotulados a cada chamada.
few_shot = "\n\n".join(f"Ticket: {ex['messages'][1]['content']}\nCategoria: {ex['messages'][2]['content']}" for ex in treino[:20])
input_few_shot = input_ft + tokens_do_texto(few_shot)
output = 3  # a resposta é só a categoria


def usd(v: float) -> str:
    return f"US$ {to_fixed(v, 4 if v < 1 else 2)}"  # toFixed, não f"{v:.2f}" (que arredonda empate p/ o par)


print(f"Treino: {len(treino)} exemplos, {tok_treino} tokens · Validação: {len(validacao)} exemplos, {tok_valid} tokens")
print(f"Tokens treinados (cobrados) = {tok_treino} × {epocas} épocas = {tok_treino * epocas}")
print(f"Input por chamada: fine-tunado ~{js_round(input_ft)} tokens · genérico few-shot (20 exemplos) ~{js_round(input_few_shot)} tokens\n")

linhas = []
for modelo, p in PRECOS.items():
    custo_treino = tok_treino * epocas * p["treino"] / 1e6
    mes_ft = tickets_mes * (input_ft * p["ft_input"] + output * p["ft_output"]) / 1e6
    mes_base = tickets_mes * (input_few_shot * p["base_input"] + output * p["base_output"]) / 1e6
    linhas.append({"modelo": modelo, "treino": usd(custo_treino), f"ft {tickets_mes}/mês": usd(mes_ft),
                   f"base few-shot {tickets_mes}/mês": usd(mes_base), "economia/mês": usd(mes_base - mes_ft)})
print(tabela(linhas))
print("Obs.: estimativa. O valor real vem em `trained_tokens` do job; a validação NÃO é cobrada como treino.")
