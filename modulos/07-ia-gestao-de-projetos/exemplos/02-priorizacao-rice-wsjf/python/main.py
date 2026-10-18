"""Priorização inteligente: o código calcula RICE/WSJF/MoSCoW/roadmap; o LLM só escreve a justificativa.

Uso (da pasta do módulo): uv run python exemplos/02-priorizacao-rice-wsjf/python/main.py
"""
import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo, para importar comum_py

from comum_py.js import js_round, num, to_fixed  # noqa: E402
from comum_py.llm import gerar_texto  # noqa: E402
from comum_py.tabela import imprimir_tabela  # noqa: E402
from priorizar import alinhamento_okr, moscow, rice, roadmap, wsjf  # noqa: E402

dados = json.loads((AQUI.parent / "backlog.json").read_text(encoding="utf-8"))  # o MESMO backlog do JS
itens, okrs, capacidade = dados["itens"], dados["okrs"], dados["capacidadePorSprint"]

classes = moscow(itens)
tabela = sorted(
    ({"id": i["id"], "titulo": i["titulo"], "RICE": js_round(rice(i)), "WSJF": num(float(to_fixed(wsjf(i), 1))),
      "MoSCoW": classes[i["id"]], "KR": i.get("kr") or "-"} for i in itens),
    key=lambda t: -t["WSJF"],
)
imprimir_tabela(tabela, indice="#")

plano = roadmap(itens, capacidade, classes)
for n, s in enumerate(plano, 1):
    print(f"Sprint {n}: {', '.join(s)}")

okr = alinhamento_okr(okrs, itens)
print("\nEsforço por KR:", " · ".join(f"{k['kr']}={k['esforcoPct']}%" for k in okr["porKr"]))
print("KRs sem iniciativa:", okr["krsSemIniciativa"], "| Itens sem KR:", okr["itensSemKr"])

# What-if: e se a confiança do chatbot (HU-04) subir para 0.9 depois de um protótipo?
hipotese = [{**i, "confidence": 0.9} if i["id"] == "HU-04" else i for i in itens]
antes = [i["id"] for i in sorted(itens, key=rice, reverse=True)]
depois = [i["id"] for i in sorted(hipotese, key=rice, reverse=True)]
print(f"\nWhat-if HU-04 confidence 0.4→0.9: ranking RICE {'>'.join(antes)}  ⟶  {'>'.join(depois)}")

# O LLM recebe os NÚMEROS prontos e só redige. Se ele errar uma conta, a tabela acima é a fonte da verdade.
top = "\n".join(f"{t['id']} {t['titulo']}: WSJF {t['WSJF']}, RICE {t['RICE']}, {t['MoSCoW']}, KR {t['KR']}" for t in tabela[:3])
justificativa = gerar_texto(
    system="Você é um PM. Escreva em português, no máximo 3 frases, sem inventar números além dos fornecidos.",
    user=f"Justifique para o comitê a ordem destes 3 itens do topo do backlog:\n{top}",
    max_tokens=160,
)
print("\nJustificativa (LLM):\n" + justificativa)
