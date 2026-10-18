"""Requirements Copilot: texto livre -> épicos, histórias, critérios de aceite e mudanças (JSON validado).

O LLM PROPÕE; o pydantic garante o formato e validar.py audita a qualidade.
Uso (da pasta do módulo): uv run python exemplos/01-requirements-copilot/python/main.py
"""
import json
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo, para importar comum_py

from comum_py.llm import extrair_json  # noqa: E402
from schema import Requisitos  # noqa: E402
from validar import auditar_requisitos  # noqa: E402

pedido = (AQUI.parent / "pedido.txt").read_text(encoding="utf-8")  # mesma entrada do JS

system = """Você é um analista de requisitos. Converta o pedido em backlog.
Regras: no máximo 2 épicos e 3 histórias no total; ids EP-01.. e HU-01..;
cada história com 2 critérios no formato "Dado ..., quando ..., então ..." e até 3 tarefas;
registre em "mudancas" as alterações de escopo pedidas e em "duvidas" o que estiver ambíguo. Português."""

t0 = time.monotonic()
req = extrair_json(Requisitos, system, pedido, max_tokens=1200).model_dump()
print(f"LLM: {time.monotonic() - t0:.1f}s")

for ep in req["epicos"]:
    print(f"\n{ep['id']} · {ep['titulo']}")
    for h in ep["historias"]:
        print(f"  {h['id']} Como {h['como']}, quero {h['quero']}, para {h['para']}")
        for c in h["criterios"]:
            print(f"     ✔ {c}")
        print(f"     tarefas: {' | '.join(h['tarefas'])}")
print("\nMudanças:", [f"{m['descricao']} -> {','.join(m['afeta'])}" for m in req["mudancas"]])
print("Dúvidas para o PO:", req["duvidas"])

auditoria = auditar_requisitos(req)
print(f"\nAuditoria determinística: {auditoria['historias']} histórias, {len(auditoria['problemas'])} problema(s)")
for p in auditoria["problemas"]:
    print("  ⚠", p)

(AQUI / "backlog.gerado.json").write_text(json.dumps(req, ensure_ascii=False, indent=2), encoding="utf-8")
print("\nSalvo em exemplos/01-requirements-copilot/python/backlog.gerado.json")
