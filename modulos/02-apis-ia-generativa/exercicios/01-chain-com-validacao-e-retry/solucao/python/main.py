"""Execução real da solução do exercício 01 (Python) contra o LLM configurado no ambiente."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))  # raiz do módulo, para importar comum_py
from comum_py.config import criar_cliente
from reembolso import decidir, extrair, redigir

cliente = criar_cliente()
PEDIDOS = [
    "Oi, aqui é a Marina Souza. Almocei com um cliente em 03/10 e gastei R$ 62,40. Pode reembolsar?",
    "Sou o Pedro Lima, peguei um táxi do aeroporto até o hotel no dia 12/10, deu 187 reais.",
]
for texto in PEDIDOS:
    print(f"\n> {texto}")
    ext = extrair(cliente, texto, log=lambda e: print("  ·", json.dumps(e, ensure_ascii=False)))
    if not ext["ok"]:
        print("  → revisão humana:", ext["erro"])
        continue
    dec = decidir(ext["dados"])
    print("  dados:", ext["dados"].model_dump_json())
    print("  decisão (código):", json.dumps(dec, ensure_ascii=False))
    print("  resposta (LLM):", redigir(cliente, ext["dados"], dec), flush=True)
