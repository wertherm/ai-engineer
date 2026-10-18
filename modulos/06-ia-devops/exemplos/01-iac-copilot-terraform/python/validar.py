"""Pipeline determinístico de validação de IaC: é ele, não o LLM, quem decide se o código serve.

fmt (corrige sozinho) → init → validate → plan → show -json → conftest (OPA).
"""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo (comum_py)
from comum_py.shell import run  # noqa: E402

# Cache de providers compartilhado entre execuções (baixa o hashicorp/local e o random uma vez só) e o
# diretório de dados do tofu (.terraform) ficam FORA do repositório: são binários de terceiros.
BASE_CACHE = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "ai-engineer-m06"
CACHE = BASE_CACHE / "tofu-plugins"


def validar_iac(hcl, dir, politicas):
    """Valida um main.tf num diretório de trabalho. Devolve {ok, etapa, erros[], recursos[], formatado}.

    `politicas` é a lista de diretórios .rego passados ao conftest.
    """
    dir = Path(dir).resolve()
    dir.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    (dir / "main.tf").write_text(hcl)
    data_dir = BASE_CACHE / "tofu-data" / hashlib.sha1(str(dir).encode()).hexdigest()[:12]
    env = {"TF_PLUGIN_CACHE_DIR": str(CACHE), "TF_DATA_DIR": str(data_dir), "TF_IN_AUTOMATION": "1"}

    def tofu(args):
        return run("tofu", args, cwd=dir, env=env)

    # 1. Formatação é problema determinístico: corrige com a ferramenta, não gasta token do LLM.
    fmt = tofu(["fmt", "-check", "-list=true"])
    if not fmt["ok"]:
        tofu(["fmt"])
    formatado = not fmt["ok"]

    def falha(etapa, erros):
        return {"ok": False, "etapa": etapa, "erros": erros, "recursos": [], "formatado": formatado}

    # 2. init: resolve e baixa providers (do cache). Erro aqui = provider/versão inventados.
    # -upgrade: se o LLM mudar a restrição de versão entre tentativas, o lock antigo não trava o init.
    init = tofu(["init", "-input=false", "-no-color", "-upgrade"])
    if not init["ok"]:
        return falha("init", [ultimas_linhas(init["stderr"] or init["stdout"])])

    # 3. validate -json: erros de sintaxe, argumentos que não existem no schema do provider etc.
    val = tofu(["validate", "-json", "-no-color"])
    vj = json.loads(val["stdout"] or "{}")
    if not vj.get("valid"):
        erros = [
            f"{d['summary']}: {d.get('detail', '')} (linha {d.get('range', {}).get('start', {}).get('line', '?')})"
            for d in vj.get("diagnostics", [])
        ]
        # Grounding vindo da ferramenta: se o modelo inventou argumento, devolvemos a lista REAL de argumentos
        # do schema do provider (`tofu providers schema -json`). Só "não existe" não basta para um modelo pequeno.
        if any(re.match(r"^(Unsupported argument|Incorrect attribute value type)", e) for e in erros):
            erros += argumentos_validos(tofu, hcl)
        return falha("validate", erros)

    # 4. plan + show -json: a política roda sobre o que VAI acontecer, não sobre o texto.
    plan = tofu(["plan", "-input=false", "-no-color", "-out=plan.bin"])
    if not plan["ok"]:
        return falha("plan", [ultimas_linhas(plan["stderr"])])
    show = tofu(["show", "-json", "plan.bin"])
    (dir / "plan.json").write_text(show["stdout"])
    plan_json = json.loads(show["stdout"])
    recursos = [f"{'/'.join(r['change']['actions'])} {r['address']}" for r in plan_json.get("resource_changes", [])]

    # 5. Policy-as-Code: conftest avalia as regras `deny` do Rego contra o plano.
    args = ["test", "plan.json", "--no-color", "-o", "json"]
    for p in politicas:
        args += ["-p", str(p)]
    ct = run("conftest", args, cwd=dir)
    resultado = json.loads(ct["stdout"] or "[]")
    negadas = [f["msg"] for r in resultado for f in (r.get("failures") or [])]
    if negadas:
        return {"ok": False, "etapa": "conftest", "erros": negadas, "recursos": recursos, "formatado": formatado}

    return {
        "ok": True, "etapa": "ok", "erros": [], "recursos": recursos, "formatado": formatado,
        "hcl_final": (dir / "main.tf").read_text(),
    }


def argumentos_validos(tofu, hcl):
    """Para cada tipo de recurso usado no HCL, lista os argumentos configuráveis segundo o schema do provider."""
    sch = tofu(["providers", "schema", "-json"])
    if not sch["ok"]:
        return []
    provedores = json.loads(sch["stdout"]).get("provider_schemas", {})
    tipos = set(re.findall(r'resource\s+"([\w-]+)"', hcl))
    dicas = []
    for p in provedores.values():
        for tipo, r in p.get("resource_schemas", {}).items():
            if tipo not in tipos:
                continue
            args = [
                # o tipo evita "min_upper = true"
                f"{n} ({a['type'][0] if isinstance(a['type'], list) else a['type']})"
                for n, a in r["block"].get("attributes", {}).items()
                if a.get("required") or a.get("optional")
            ]
            dicas.append(f"Argumentos válidos de {tipo}: {', '.join(args)}")
    return dicas


def ultimas_linhas(texto, n=8):
    """O tofu repete o mesmo diagnóstico às vezes: deduplicamos para não gastar token do LLM com eco."""
    linhas = [l.strip() for l in texto.strip().split("\n") if l.strip()]
    unicas = list(dict.fromkeys(linhas))
    return " | ".join(unicas[-n:])
