"""Segurança com IA no loop: scanner determinístico (Trivy) acha → LLM explica e propõe o fix →
validação (YAML + dry-run no API server) → re-scan prova que melhorou e que não piorou nada.
"""
import json
import os
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

import yaml

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo (comum_py)
from comum_py.llm import chat, resumo_uso, tirar_cercas  # noqa: E402
from comum_py.shell import kubectl, run  # noqa: E402

ALVOS = AQUI.parent / "alvos"  # os MESMOS alvos com problemas plantados do JS
SAIDA = AQUI / "saida"
ORDEM = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
# O cache do Trivy (banco de checks) fica no default dele, ~/.cache/trivy: fora do repositório.


def trivy_config(alvo):
    r = run("trivy", ["config", "--quiet", "--format", "json", str(alvo)], timeout=600)
    if not r["ok"]:
        raise RuntimeError(f"trivy falhou: {r['stderr']}")
    return [x for x in json.loads(r["stdout"]).get("Results") or [] if x.get("Misconfigurations")]


def contar(ms):
    c = Counter(m["Severity"] for m in ms)
    return " ".join(f"{s}={n}" for s, n in sorted(c.items(), key=lambda kv: ORDEM.get(kv[0], 9)))


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)

    # 1. Scan de IaC, manifests e Dockerfile (misconfigurations).
    print("== 1. trivy config alvos/ ==", flush=True)
    antes = trivy_config(ALVOS)
    for r in antes:
        print(f"   {r['Target']:<16} {contar(r['Misconfigurations'])}")
    achados_dep = next(r for r in antes if r["Target"] == "deployment.yaml")["Misconfigurations"]

    # 2. Vazamento de segredo: geramos um arquivo com um token FALSO em tempo de execução (não fica no repo,
    #    para não disparar o push protection do GitHub) e rodamos o scanner de segredos.
    print("\n== 2. trivy fs --scanners secret ==", flush=True)
    dir_segredo = SAIDA / "segredo"
    dir_segredo.mkdir(parents=True, exist_ok=True)
    falso = "ghp_" + "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7d"
    (dir_segredo / "app.env").write_text(f"PORTA=8080\nGITHUB_TOKEN={falso}\n")
    sec = json.loads(run("trivy", ["fs", "--quiet", "--scanners", "secret", "--format", "json", str(dir_segredo)])["stdout"])
    for r in sec.get("Results") or []:
        for s in r.get("Secrets") or []:
            print(f"   {s['Severity']} {s['RuleID']} em {r['Target']}:{s['StartLine']} → {s['Match']}")
    shutil.rmtree(dir_segredo)

    # 3. AI fix só do manifest K8s (o mais acionável). Mandamos só HIGH/MEDIUM: prompt curto e foco.
    print("\n== 3. LLM explica e corrige deployment.yaml ==", flush=True)
    manifest = (ALVOS / "deployment.yaml").read_text()
    achados = "\n".join(f"- {m['ID']} ({m['Severity']}): {m['Title']}" for m in achados_dep if m["Severity"] in ("HIGH", "MEDIUM"))
    expl, _, _ = chat([
        {"role": "system", "content": "Você é um engenheiro de segurança. Explique em português, em até 3 frases curtas, o RISCO REAL dos achados mais graves para um time de produto."},
        {"role": "user", "content": achados},
    ], max_tokens=110)
    print(f"   explicação: {re.sub(r'\n+', ' ', (expl.content or '').strip())}", flush=True)

    fix, ms, _ = chat([
        {"role": "system", "content": "Corrija o manifest Kubernetes para resolver os achados. Mantenha nome, labels, réplicas e porta. "
         'Use imagem nginxinc/nginx-unprivileged:1.31.6-alpine na porta 8080, namespace "pagamentos", securityContext restritivo e requests/limits. Responda só com o YAML.'},
        {"role": "user", "content": f"Achados:\n{achados}\n\nManifest:\n{manifest}"},
    ], max_tokens=450)
    corrigido = tirar_cercas(fix.content)
    arq = SAIDA / "deployment.corrigido.yaml"
    arq.write_text(corrigido)
    print(f"   fix proposto em {ms / 1000:.0f}s → {os.path.relpath(arq)}", flush=True)

    # 4. Validação determinística do fix: é YAML? o API server aceita? (dry-run não grava nada)
    try:
        list(yaml.safe_load_all(corrigido))
    except yaml.YAMLError as e:
        print(f"   ✗ YAML inválido: {e}")
        return 1
    dry = kubectl(["apply", "--dry-run=client", "--validate=strict", "-f", str(arq)])
    # o namespace "pagamentos" não existe no kind: tiramos a linha e validamos no "default".
    sem_ns = re.sub(r"^\s*namespace:.*$", "", corrigido, count=1, flags=re.M)
    dry_server = kubectl(["apply", "--dry-run=server", "-n", "default", "-f", "-"], input=sem_ns)
    print(f"   dry-run client: {'✓' if dry['ok'] else '✗ ' + dry['stderr'].strip()} · "
          f"dry-run server: {'✓' if dry_server['ok'] else '✗ ' + dry_server['stderr'].strip()}")

    # 5. Re-scan: o fix só vale se reduzir os achados e não criar nenhum novo.
    print("\n== 4. re-scan ==", flush=True)
    depois_r = trivy_config(arq)
    depois = depois_r[0]["Misconfigurations"] if depois_r else []
    ids_antes = {m["ID"] for m in achados_dep}
    novos = [m for m in depois if m["ID"] not in ids_antes]
    print(f"   antes : {contar(achados_dep)}")
    print(f"   depois: {contar(depois) or 'nenhum achado'}")
    print(f"   restantes: {', '.join(m['ID'] for m in depois) or '-'} · "
          f"novos introduzidos pelo fix: {', '.join(m['ID'] for m in novos) or 'nenhum'}")
    # 6. Veredito determinístico: o fix só segue para PR se o API server aceitou e nada novo apareceu.
    aceito = dry["ok"] and dry_server["ok"] and not novos and len(depois) < len(ids_antes)
    print(f"\nVeredito: fix {'ACEITO → segue para PR com revisão humana' if aceito else 'REJEITADO → não vai para o PR (devolver ao LLM ou corrigir à mão)'}")
    print(resumo_uso())
    return 0


if __name__ == "__main__":
    sys.exit(main())
