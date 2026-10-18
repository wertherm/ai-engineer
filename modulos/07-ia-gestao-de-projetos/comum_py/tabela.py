"""Tabela simples no terminal (o equivalente enxuto do console.table do Node)."""


def imprimir_tabela(linhas: list[dict], indice: str | None = None) -> None:
    if not linhas:
        print("(vazio)")
        return
    colunas = list(linhas[0].keys())
    cab = ([indice] if indice else []) + colunas
    corpo = [([str(i)] if indice else []) + ["-" if l[c] is None else str(l[c]) for c in colunas] for i, l in enumerate(linhas)]
    larg = [max(len(cab[j]), *(len(r[j]) for r in corpo)) for j in range(len(cab))]
    fmt = lambda r: "│ " + " │ ".join(v.ljust(larg[j]) for j, v in enumerate(r)) + " │"
    print(fmt(cab))
    print("├─" + "─┼─".join("─" * w for w in larg) + "─┤")
    for r in corpo:
        print(fmt(r))
