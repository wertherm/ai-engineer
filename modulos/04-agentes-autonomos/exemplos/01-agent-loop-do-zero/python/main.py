"""Roda uma tarefa (ou a passada como argumento) no agent loop e imprime o resumo de uso."""

import sys
import time

from agente import executar_agente
from comum_py.llm import resumo_uso

tarefa = sys.argv[1] if len(sys.argv) > 1 else "Temos teclados suficientes para 3 pedidos de 12 unidades cada? Quantos sobram?"
print("Tarefa:", tarefa)
t0 = time.perf_counter()
r = executar_agente(tarefa)
print(f"\nResumo: {r['passos']} passos em {time.perf_counter() - t0:.1f}s · {resumo_uso()}")
