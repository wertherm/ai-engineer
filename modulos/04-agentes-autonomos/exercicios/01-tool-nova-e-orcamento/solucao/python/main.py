"""Dois cenários: orçamento folgado (termina) e apertado (o guardrail corta antes da 2ª chamada)."""

import re

from agente import executar_agente

tarefa = "Quanto custam 3 monitores?"

print("== orçamento folgado ==")
ok = executar_agente(tarefa)
print("resultado:", ok)
assert ok["motivo"] == "ok"
assert re.search(r"2700", ok["resposta"].replace(".", ""))

print("\n== orçamento apertado (1 chamada) ==")
corte = executar_agente(tarefa, orcamento={"chamadas": 1, "tokens": 3000})
print("resultado:", corte)
assert corte["motivo"] == "orcamento"
print("\n✅ tool nova usada e guardrail de orçamento funcionando")
