"""NL → PromQL com dupla validação determinística:

1) sintaxe: o parser OFICIAL do Prometheus (`promtool check rules`, via imagem Docker prom/prometheus);
2) semântica: toda métrica e todo label usados precisam existir no catálogo (anti-alucinação).
"""
import os
import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo (comum_py)
from comum_py.llm import chat, resumo_uso  # noqa: E402
from comum_py.shell import run  # noqa: E402

IMAGEM_PROM = os.environ.get("IMAGEM_PROM", "prom/prometheus:v3.15.0")

# Catálogo de métricas que EXISTEM no seu Prometheus (em produção: GET /api/v1/metadata e /api/v1/labels).
CATALOGO = {
    "http_requests_total": ["service", "status", "method"],
    "http_request_duration_seconds_bucket": ["service", "le"],
    "container_memory_working_set_bytes": ["namespace", "pod", "container"],
    "kube_pod_container_status_restarts_total": ["namespace", "pod", "container"],
}

PERGUNTAS = [
    "Qual a porcentagem de respostas 5xx do serviço checkout nos últimos 5 minutos?",
    "Qual a latência p95 do serviço checkout nos últimos 5 minutos?",
    "Quais pods do namespace prod reiniciaram mais de 3 vezes na última hora?",
]

SYSTEM = (
    "Você traduz perguntas em PromQL. Métricas disponíveis (nome: labels):\n"
    + "\n".join(f"- {m}: {', '.join(l)}" for m, l in CATALOGO.items())
    + "\nUse SÓ essas métricas e labels. Responda apenas com a expressão PromQL, numa linha, sem crases."
)


def validar_sintaxe(exprs):
    """Valida sintaxe de várias expressões numa única execução do promtool (1 container só). None = ok."""
    regras = {"groups": [{"name": "nl2promql", "rules": [{"record": f"q:{i}", "expr": e} for i, e in enumerate(exprs)]}]}
    r = run("docker", ["run", "--rm", "-i", "--entrypoint", "promtool", IMAGEM_PROM, "check", "rules", "/dev/stdin"],
            input=yaml.safe_dump(regras, sort_keys=False, allow_unicode=True))
    if r["ok"]:
        return None
    return next((l for l in (r["stdout"] + r["stderr"]).split("\n") if "parse error" in l), r["stderr"].strip())


PALAVRAS = {"sum", "avg", "min", "max", "count", "rate", "irate", "increase", "delta", "by", "without",
            "histogram_quantile", "topk", "bottomk", "and", "or", "unless", "on", "ignoring", "group_left", "group_right",
            "offset", "bool", "abs", "clamp_min", "clamp_max", "sum_over_time", "avg_over_time", "max_over_time", "changes", "resets"}
AGRUP = r"\b(?:by|without|on|ignoring)\s*\("


def validar_catalogo(expr):
    """Confere métricas e labels contra o catálogo. Devolve lista de problemas."""
    problemas = []
    sem_strings = re.sub(r'"[^"]*"', '""', expr)
    # Labels usados em matchers {a="x"} e em by(...)/without(...)/on(...). re.ASCII: \w igual ao do JS.
    labels = re.findall(r"([a-zA-Z_]\w*)\s*(?:=~|!~|!=|=)", sem_strings, re.ASCII)
    for g in re.findall(AGRUP + r"([^)]*)\)", sem_strings):
        labels += [s.strip() for s in g.split(",") if s.strip()]
    # Métricas: identificadores fora de {} e de by(...), que não são função/palavra-chave.
    corpo = re.sub(r"\{[^}]*\}", "", sem_strings)
    corpo = re.sub(AGRUP + r"[^)]*\)", "", corpo)
    corpo = re.sub(r"\[[^\]]*\]", "", corpo)
    metricas = [t for t in re.findall(r"\b([a-zA-Z_:][\w:]*)\b(?!\s*\()", corpo, re.ASCII)
                if t not in PALAVRAS and not t[0].isdigit()]
    if not metricas:
        problemas.append("nenhuma métrica do catálogo foi usada")
    labels_validos = set()
    for m in metricas:
        if m not in CATALOGO:
            problemas.append(f"métrica inexistente: {m}")
        else:
            labels_validos.update(CATALOGO[m])
    for l in dict.fromkeys(labels):
        if labels_validos and l not in labels_validos:
            problemas.append(f"label inexistente: {l}")
    return problemas


def traduzir(pergunta):
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": pergunta}]
    for t in (1, 2):
        msg, ms, _ = chat(messages, max_tokens=90)
        expr = (msg.content or "").replace("`", "").strip().split("\n")[0]
        erro_sintaxe = validar_sintaxe([expr])
        problemas = [f"sintaxe: {erro_sintaxe}"] if erro_sintaxe else validar_catalogo(expr)
        print(f"   tentativa {t} ({ms / 1000:.0f}s): {expr}", flush=True)
        if not problemas:
            return True
        for p in problemas:
            print(f"     ✗ {p}")
        messages += [{"role": "assistant", "content": expr}, {"role": "user", "content": f"Inválida: {'; '.join(problemas)}. Corrija."}]
    return False


def main():
    # Sanidade do validador antes de confiar nele: uma expressão quebrada e uma alucinada.
    print("Autoteste do validador:")
    print(f"   sintaxe quebrada  → {validar_sintaxe(['sum(rate(http_requests_total[5m])'])}")
    print(f"   métrica alucinada → {'; '.join(validar_catalogo('rate(http_errors_total{svc=\"checkout\"}[5m])'))}\n", flush=True)
    if "--sem-llm" in sys.argv:
        return
    validas = 0
    for p in PERGUNTAS:
        print(f"Pergunta: {p}", flush=True)
        ok = traduzir(p)
        validas += ok
        print(f"   {'✓ aprovada' if ok else '✗ descartada (não vai para o dashboard)'}\n")
    print(f"{validas}/{len(PERGUNTAS)} consultas aprovadas · {resumo_uso()}")


if __name__ == "__main__":
    main()
