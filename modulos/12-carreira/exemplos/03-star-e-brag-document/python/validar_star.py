"""Valida histórias STAR: estrutura, proporção, primeira pessoa, resultado medido e duração falada.

Lê o MESMO ../historias.json da versão JS.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para achar comum_py
from comum_py.formato import to_fixed  # noqa: E402

PASTA = Path(__file__).resolve().parent.parent
PARTES = ["situacao", "tarefa", "acao", "resultado"]

# re.ASCII: no JS (sem a flag u) \w e \b só conhecem [A-Za-z0-9_]. Sem ASCII, o Python contaria
# "faríamos" como plural (\w{3,}amos casa com "faríamos" inteiro); no JS o "í" quebra a palavra.
_SINGULAR = re.compile(r"\beu\b|\b\w{3,}ei\b", re.I | re.A)
_PLURAL = re.compile(r"\bn[óo]s\b|\ba gente\b|\b\w{3,}amos\b|\b\w{3,}emos\b", re.I | re.A)


def palavras(t: str) -> int:
    return len(t.split())


def validar_star(h: dict) -> dict:
    total = sum(palavras(h.get(k, "")) for k in PARTES)
    contexto = palavras(h.get("situacao", "")) + palavras(h.get("tarefa", ""))
    # Primeira pessoa do singular: "eu" ou verbo no pretérito terminado em -ei (heurística).
    # Plural ("nós", "fizemos", "a gente") esconde o SEU papel.
    singular = len(_SINGULAR.findall(h["acao"]))
    plural = len(_PLURAL.findall(h["acao"]))
    checagens = {
        "quatro partes preenchidas": all(palavras(h.get(k, "")) > 3 for k in PARTES),
        "contexto (S+T) <= 30% do texto": contexto / total <= 0.3,
        "ação na 1ª pessoa do singular": singular >= 2 and singular > plural,
        "resultado com número": bool(re.search(r"\d", h["resultado"])),
        "resultado com aprendizado": bool(re.search(r"aprendi|faria diferente|li[çc][ãa]o", h["resultado"], re.I)),
        "cabe em 1–3 min falando": 0.5 <= total / 150 <= 3,
    }
    return {"total": total, "minutos": total / 150, "checagens": checagens, "ok": all(checagens.values())}


def main() -> None:
    historias = json.loads((PASTA / "historias.json").read_text(encoding="utf-8"))
    for h in historias:
        r = validar_star(h)
        print(f"\n{'✓' if r['ok'] else '✗'} {h['id']} · {r['total']} palavras (~{to_fixed(r['minutos'], 1)} min falando)")
        for nome, ok in r["checagens"].items():
            print(f"   {'[x]' if ok else '[ ]'} {nome}")


if __name__ == "__main__":
    main()
