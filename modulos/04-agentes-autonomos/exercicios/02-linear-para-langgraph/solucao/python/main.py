"""Três caminhos do grafo verificados com assert."""

import re

from comum_py.llm import resumo_uso
from grafo import criar_grafo

casos = [
    ("API ok", "Quero 2 cadeiras entregues no CEP 01310-100", {}),
    ("API fora do ar", "Quero 2 cadeiras entregues no CEP 01310-100", {"api_falhando": True}),
    ("pedido sem CEP", "Quero 5 mesas", {}),
]
saidas = []
for nome, pedido, opts in casos:
    s = criar_grafo(**opts).invoke({"pedido": pedido})
    print(f"[{nome}] {' -> '.join(s['trilha'])}\n  {s['resposta']}")
    saidas.append(s)

assert re.search(r"frete R\$ 25 \(api\)", saidas[0]["resposta"])
assert "fallback" in saidas[1]["resposta"] and saidas[1]["trilha"][-2:] == ["frete_padrao", "responder"]
assert "fallback" in saidas[2]["trilha"]
print(f"\n✅ 3 caminhos do grafo verificados · {resumo_uso()}")
