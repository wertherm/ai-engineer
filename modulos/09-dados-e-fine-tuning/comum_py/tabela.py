"""Tabela de texto no estilo do `console.table` do Node (sem a coluna "(index)"), só com a stdlib."""
from __future__ import annotations


def tabela(linhas: list[dict]) -> str:
    if not linhas:
        return "(vazio)"
    cols = list(linhas[0])
    cel = [[str(l.get(c, "")) for c in cols] for l in linhas]
    larg = [max(len(c), *(len(r[i]) for r in cel)) for i, c in enumerate(cols)]
    fmt = lambda vals: "│ " + " │ ".join(v.ljust(w) for v, w in zip(vals, larg)) + " │"  # noqa: E731
    sep = lambda a, b, c: a + b.join("─" * (w + 2) for w in larg) + c  # noqa: E731
    return "\n".join([sep("┌", "┬", "┐"), fmt(cols), sep("├", "┼", "┤"), *map(fmt, cel), sep("└", "┴", "┘")])
