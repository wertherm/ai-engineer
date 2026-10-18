"""Compara ReAct x Plan-and-Execute na MESMA tarefa e imprime passos, chamadas, tokens e tempo reais.
O ReAct com LangChain (create_agent) roda à parte: react_langchain.py."""

import time

from comum_py.llm import uso
from ferramentas import RESPOSTA_CERTA, TAREFA, acertou
from plan_execute import plan_execute
from react import react

print(f"Tarefa: {TAREFA}\nResposta certa: {RESPOSTA_CERTA}")
linhas = []
for nome, fn in [("ReAct (manual)", react), ("Plan-and-Execute", plan_execute)]:
    print(f"\n=== {nome} ===")
    t0, tok0 = time.perf_counter(), uso.prompt_tokens + uso.completion_tokens
    r = fn(TAREFA)
    print(f"  resposta: {str(r['resposta']).strip()}")
    linhas.append((nome, r["llm_calls"], r["chamadas_tool"], uso.prompt_tokens + uso.completion_tokens - tok0,
                   f"{time.perf_counter() - t0:.1f}", acertou(r["resposta"])))

print("\nComparativo:")
cab = ("estrategia", "llm_calls", "chamadas_tool", "tokens", "segundos", "acertou")
print(f"{cab[0]:<18} {cab[1]:>9} {cab[2]:>13} {cab[3]:>7} {cab[4]:>9} {cab[5]:>8}")
for l in linhas:
    print(f"{l[0]:<18} {l[1]:>9} {l[2]:>13} {l[3]:>7} {l[4]:>9} {str(l[5]):>8}")
