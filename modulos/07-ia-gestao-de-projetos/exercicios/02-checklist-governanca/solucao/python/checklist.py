"""Checklist de governança automatizado: audita uma pasta de projeto e devolve evidências por item.

Cada verificação é uma função pura (pasta) -> {ok, evidencia}. Nada de LLM: auditoria precisa ser reproduzível.
O projeto auditado é o mesmo projeto-exemplo (Node) do JS: as regras olham package.json, CHANGELOG, ADRs etc.
"""
import json
import re
import subprocess
from pathlib import Path

IGNORAR = {"node_modules", ".git", ".venv", "__pycache__"}


def _arquivos(pasta: Path) -> list[Path]:
    """Todos os arquivos, recursivo e em ordem alfabética (resultado estável), ignorando dependências e .git."""
    saida = []
    for p in sorted(pasta.iterdir()):
        if p.name in IGNORAR:
            continue
        saida.extend(_arquivos(p) if p.is_dir() else [p])
    return saida


def _pkg(d: Path) -> dict:
    return json.loads((d / "package.json").read_text(encoding="utf-8"))


def gov01(d: Path) -> dict:
    falta = [f for f in ("README.md", "CHANGELOG.md") if not (d / f).exists()]
    return {"ok": not falta, "evidencia": f"faltando: {', '.join(falta)}" if falta else "ambos presentes"}


def gov02(d: Path) -> dict:
    version = _pkg(d)["version"]
    log = (d / "CHANGELOG.md").read_text(encoding="utf-8") if (d / "CHANGELOG.md").exists() else ""
    ok = f"[{version}]" in log
    return {"ok": ok, "evidencia": f"versão {version} documentada" if ok else f"versão {version} não aparece no CHANGELOG"}


def gov03(d: Path) -> dict:
    pkg = _pkg(d)
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    soltas = [f"{n}@{v}" for n, v in deps.items() if re.search(r"^[\^~*]|^latest$|[<>]", v)]
    return {"ok": not soltas, "evidencia": ", ".join(soltas) if soltas else "todas exatas"}


def gov04(d: Path) -> dict:
    pasta = d / "docs" / "adr"
    if not pasta.exists():
        return {"ok": False, "evidencia": "sem docs/adr"}
    incompletos = [f.name for f in sorted(pasta.glob("*.md"))
                   if not all(c in f.read_text(encoding="utf-8") for c in ("Status:", "Data:", "Decisores:"))]
    return {"ok": not incompletos, "evidencia": f"incompletos: {', '.join(incompletos)}" if incompletos else "todos completos"}


def gov05(d: Path) -> dict:
    req = d / "docs" / "requisitos.md"
    if not req.exists():
        return {"ok": False, "evidencia": "sem docs/requisitos.md"}
    ids = list(dict.fromkeys(re.findall(r"HU-\d+", req.read_text(encoding="utf-8"))))
    testes = "\n".join(f.read_text(encoding="utf-8") for f in _arquivos(d) if re.search(r"\.test\.[jt]s$", f.name))
    sem_teste = [i for i in ids if i not in testes]
    return {"ok": not sem_teste, "evidencia": f"sem teste: {', '.join(sem_teste)}" if sem_teste else f"{len(ids)} requisitos cobertos"}


PADRAO_SEGREDO = re.compile(r"""(api[_-]?key|secret|password|senha|token)\s*[:=]\s*['"][^'"]{8,}['"]""", re.I)


def gov06(d: Path) -> dict:
    achados = [str(f.relative_to(d)) for f in _arquivos(d)
               if re.search(r"\.(js|ts|json|env)$", f.name) and PADRAO_SEGREDO.search(f.read_text(encoding="utf-8"))]
    return {"ok": not achados, "evidencia": f"possível segredo em: {', '.join(achados)}" if achados else "nada encontrado"}


def gov07(d: Path) -> dict:
    if not (d / ".git").exists():
        return {"ok": None, "evidencia": "não é repositório git: verificação pulada"}
    version = _pkg(d)["version"]
    # Lista de argumentos, sem shell: nome de pasta esquisito não vira injeção de comando.
    tags = subprocess.run(["git", "-C", str(d), "tag", "--list"], capture_output=True, text=True, check=True).stdout.split("\n")
    ok = f"v{version}" in tags
    return {"ok": ok, "evidencia": f"tag v{version} existe" if ok else f"tag v{version} ausente"}


VERIFICACOES = [
    ("GOV-01", "README e CHANGELOG presentes", gov01),
    ("GOV-02", "Versão do package.json registrada no CHANGELOG (controle de versão)", gov02),
    ("GOV-03", "Dependências com versão exata (build reproduzível)", gov03),
    ("GOV-04", "ADRs com Status, Data e Decisores (trilha de decisão)", gov04),
    ("GOV-05", "Rastreabilidade: todo requisito citado em algum teste", gov05),
    ("GOV-06", "Sem segredo fixo no código", gov06),
    ("GOV-07", "Tag git da versão atual (se for repositório git)", gov07),
]


def auditar(pasta: str | Path) -> list[dict]:
    d = Path(pasta)
    return [{"id": id_, "titulo": titulo, **rodar(d)} for id_, titulo, rodar in VERIFICACOES]
