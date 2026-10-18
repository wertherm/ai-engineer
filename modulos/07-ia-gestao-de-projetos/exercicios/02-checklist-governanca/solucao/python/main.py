"""Imprime o checklist, grava auditoria.json e sai com código 1 se algo falhar (etapa de CI).

Uso (da pasta do módulo): uv run python exercicios/02-checklist-governanca/solucao/python/main.py [pasta-do-projeto]
"""
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from checklist import auditar

AQUI = Path(__file__).resolve().parent
pasta = Path(sys.argv[1] if len(sys.argv) > 1 else AQUI.parents[1] / "projeto-exemplo").resolve()
resultado = auditar(pasta)
icone = {True: "✅", False: "❌", None: "⏭ "}
print(f"Auditoria de governança: {pasta}\n")
for r in resultado:
    print(f"{icone[r['ok']]} {r['id']} {r['titulo']}\n      {r['evidencia']}")

falhas = sum(r["ok"] is False for r in resultado)
relatorio = {"pasta": str(pasta), "auditadoEm": datetime.now(UTC).isoformat(), "falhas": falhas, "resultado": resultado}
(AQUI / "auditoria.json").write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n{falhas} falha(s). Evidências em solucao/python/auditoria.json")
sys.exit(1 if falhas else 0)
