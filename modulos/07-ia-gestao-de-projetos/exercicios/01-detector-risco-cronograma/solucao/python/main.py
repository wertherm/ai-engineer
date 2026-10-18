"""Uso (da pasta do módulo): uv run python exercicios/01-detector-risco-cronograma/solucao/python/main.py"""
import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[3]))  # raiz do módulo, para importar comum_py

from detector import detectar_riscos  # noqa: E402

historico = json.loads((AQUI.parent / "historico-sprints.json").read_text(encoding="utf-8"))  # mesmo histórico do JS

print(f"Analisando sprint {historico[-1]['sprint']} contra {len(historico) - 1} sprints anteriores\n")
for r in detectar_riscos(historico):
    print(f"[{r['severidade'].upper()}] risco de {r['tipo']}")
    for e in r["evidencia"]:
        print(f"   evidência: {e}")
    print(f"   mitigação: {r['mitigacao']}")

# Comparação: a sprint 6 (saudável) não deve gerar alerta nenhum.
print("\nSprint 6 (controle):", len(detectar_riscos(historico[:6])), "risco(s)")
