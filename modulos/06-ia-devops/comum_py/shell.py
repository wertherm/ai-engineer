"""Execução de ferramentas determinísticas (tofu, conftest, kubectl, trivy, docker).

Sempre com argv em lista (subprocess sem shell=True): o LLM nunca consegue injetar "; rm -rf".
"""
import os
import subprocess


def run(binario, args, cwd=None, input=None, timeout=300, env=None):
    """Roda um binário e devolve {ok, code, stdout, stderr} sem lançar exceção."""
    try:
        p = subprocess.run(
            [binario, *args],
            cwd=cwd,
            input=input,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, **(env or {})},
        )
        return {"ok": p.returncode == 0, "code": p.returncode, "stdout": p.stdout, "stderr": p.stderr}
    except subprocess.TimeoutExpired as e:
        saida = e.stdout.decode() if isinstance(e.stdout, bytes) else (e.stdout or "")
        return {"ok": False, "code": 124, "stdout": saida, "stderr": f"timeout de {timeout}s"}
    except FileNotFoundError:
        return {"ok": False, "code": 127, "stdout": "", "stderr": f"binário não encontrado: {binario}"}


# Todo kubectl do módulo fala SÓ com o cluster kind de estudo (nunca com o contexto "atual" da máquina).
KCTX = os.environ.get("KUBE_CONTEXT", "kind-estudo")


def kubectl(args, **kw):
    return run("kubectl", ["--context", KCTX, *args], **kw)


def cortar(texto, n=20):
    """Primeiras n linhas de um texto (para não estourar o contexto do LLM)."""
    return "\n".join(texto.split("\n")[:n])
