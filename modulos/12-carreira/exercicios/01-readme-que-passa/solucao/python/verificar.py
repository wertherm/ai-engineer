"""Solução do exercício 01 (Python): roda o checklist do exemplo 01 no README fraco e no reescrito.

Lê os MESMOS ../../readme-fraco.md e ../README-reescrito.md da versão JS. Sai com código 0 se passar.
"""
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
MODULO = AQUI.parents[3]
# A pasta do exemplo tem hífens (não é pacote importável): pomos a pasta python/ dele no sys.path.
sys.path.insert(0, str(MODULO / "exemplos/01-auditoria-de-readme/python"))
from checklist import auditar_texto  # noqa: E402

antes = auditar_texto((AQUI.parents[1] / "readme-fraco.md").read_text(encoding="utf-8"))
depois = auditar_texto((AQUI.parent / "README-reescrito.md").read_text(encoding="utf-8"))

print("critério          antes  depois")
for a, d in zip(antes["resultados"], depois["resultados"]):
    print(f"{a.id:<17} {' [x] ' if a.ok else ' [ ] '}  {'[x]' if d.ok else '[ ]'}")
print(f"\nnota: {antes['nota']}% -> {depois['nota']}% · {'PASSA' if depois['passou'] else 'NÃO PASSA'}")
# Os números do README reescrito vieram da execução real do projeto final da trilha LLMOps: nada inventado.
sys.exit(0 if depois["passou"] else 1)
