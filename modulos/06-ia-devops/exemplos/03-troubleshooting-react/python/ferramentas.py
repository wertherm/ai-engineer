"""Toolbox SOMENTE LEITURA do agente de troubleshooting. Cada tool devolve texto curto e já filtrado:
mandar o `kubectl describe` inteiro (~120 linhas) ao modelo pequeno custa minutos de prefill na CPU.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo (comum_py)
from comum_py.shell import cortar, kubectl  # noqa: E402

NS = "m06py-troubleshoot"


def pod_json(nome):
    r = kubectl(["-n", NS, "get", "pod", nome, "-o", "json"])
    if not r["ok"]:
        raise RuntimeError(f"pod {nome} não encontrado")
    return json.loads(r["stdout"])


def descrever_pod(nome):
    p = pod_json(nome)
    c = (p["status"].get("containerStatuses") or [{}])[0]
    spec = p["spec"]["containers"][0]
    ev = kubectl(["-n", NS, "get", "events", "--field-selector", f"involvedObject.name={nome}",
                  "--sort-by=.lastTimestamp", "-o", "custom-columns=TIPO:.type,MOTIVO:.reason,MSG:.message", "--no-headers"])
    # Campos ausentes saem do JSON (como o undefined do JS): menos tokens para o modelo.
    estados = [
        {k: x for k, x in {"tipo": tipo, "reason": v.get("reason"), "exitCode": v.get("exitCode"),
                           "message": (v.get("message") or "")[:160] or None}.items() if x is not None}
        for tipo, v in (c.get("state") or {}).items()
    ]
    term = (c.get("lastState") or {}).get("terminated")
    return json.dumps({
        "imagem": spec["image"],
        "estadoAtual": estados[0] if estados else None,
        "ultimoTermino": {"reason": term.get("reason"), "exitCode": term.get("exitCode")} if term else None,
        "restarts": c.get("restartCount", 0),
        "limites": (spec.get("resources") or {}).get("limits") or "nenhum",
        "eventos": [re.sub(r"\s+", " ", l)[:160] for l in ev["stdout"].strip().split("\n")[-4:]],
    }, ensure_ascii=False)


def logs_pod(nome):
    # Em CrashLoopBackOff o container atual costuma estar "terminated" e é ELE que tem o log;
    # o --previous aponta para uma execução mais antiga que o kubelet já pode ter coletado.
    for extra in ([], ["--previous"]):
        r = kubectl(["-n", NS, "logs", nome, "--tail=15", *extra])
        if r["ok"] and r["stdout"].strip():
            return cortar(r["stdout"].strip(), 15)
    return "(sem logs: o container nunca chegou a rodar ou os logs já foram coletados)"


FERRAMENTAS = {
    "descrever_pod": (
        descrever_pod,
        "Estado do container (waiting/terminated, motivo, exit code), restarts, limites de recurso e os últimos eventos do pod.",
    ),
    "logs_pod": (logs_pod, "Últimas linhas de log do container (da execução atual ou, se não houver, da anterior)."),
}

# Schema OpenAI (function calling) gerado a partir da toolbox.
TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": nome,
            "description": desc,
            "parameters": {
                "type": "object",
                "properties": {"nome": {"type": "string", "description": "nome do pod"}},
                "required": ["nome"],
            },
        },
    }
    for nome, (_, desc) in FERRAMENTAS.items()
]


def classificar_por_regra(nome):
    """Baseline determinístico (regras): lê o mesmo estado que o agente e classifica sem LLM.

    Serve de "gabarito barato" para comparar com o agente: se regras resolvem, o LLM só explica.
    """
    c = (pod_json(nome)["status"].get("containerStatuses") or [{}])[0]
    waiting = ((c.get("state") or {}).get("waiting") or {}).get("reason")
    term = ((c.get("lastState") or {}).get("terminated") or {}).get("reason") or \
        ((c.get("state") or {}).get("terminated") or {}).get("reason")
    if waiting in ("ImagePullBackOff", "ErrImagePull"):
        return "ImagePullBackOff"
    if term == "OOMKilled":
        return "OOMKilled"
    if waiting == "CrashLoopBackOff" or term == "Error":
        return "CrashLoopBackOff"
    return "Outro"
