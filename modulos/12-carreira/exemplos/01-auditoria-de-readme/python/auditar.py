"""Audita READMEs de pastas reais deste repositório (ou as que você passar na linha de comando).

Uso (da pasta do módulo): uv run python exemplos/01-auditoria-de-readme/python/auditar.py [pasta ...]
"""
import os
import sys
from pathlib import Path

from checklist import auditar_texto

RAIZ_REPO = Path(__file__).resolve().parents[5]

# Padrão: três projetos reais do repo (um projeto final, um exemplo de produção e um módulo) + um README fraco.
PADRAO = [RAIZ_REPO / p for p in (
    "trilhas-extras/llmops-vllm-openshift/projeto-final",
    "modulos/03-mcp/exemplos/04-mcp-http-producao",
    "trilhas-extras/mlops/exemplos/04-drift-e-monitoramento",
    "modulos/12-carreira/exemplos/01-auditoria-de-readme/fixtures/projeto-fraco",
)]


def rel(p: Path) -> str:
    return os.path.relpath(p, RAIZ_REPO)


def main(argv: list[str]) -> None:
    pastas = [Path(p).resolve() for p in argv] if argv else PADRAO
    falhas = 0
    for pasta in pastas:
        arq = pasta / "README.md"
        if not arq.exists():
            print(f"\n✗ {rel(pasta)}: sem README.md (isso já reprova)")
            falhas += 1
            continue
        r = auditar_texto(arq.read_text(encoding="utf-8"), os.listdir(pasta))
        if not r["passou"]:
            falhas += 1
        status = "PASSA" if r["passou"] else "NÃO PASSA"
        print(f"\n{'✓' if r['passou'] else '✗'} {rel(pasta)} · nota {r['nota']}% · {status}")
        for c in r["resultados"]:
            print(f"   {'[x]' if c.ok else '[ ]'} {c.id:<15} {'*' if c.obrigatorio else ' '} {'' if c.ok else c.descricao}")
        if r["faltando_obrigatorio"]:
            print(f"   faltando (obrigatório): {', '.join(r['faltando_obrigatorio'])}")
    print(f"\n{len(pastas) - falhas}/{len(pastas)} READMEs passam no checklist (* = obrigatório).")


if __name__ == "__main__":
    main(sys.argv[1:])
