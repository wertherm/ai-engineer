"""Agente de deploy end-to-end: NL → spec (LLM) → validação → dry-run no servidor → apply →
espera readiness → rollback automático se a nova versão não ficar pronta.
"""
import re
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo (comum_py)
sys.path.insert(0, str(AQUI))
from comum_py.llm import chat, extrair_json, resumo_uso  # noqa: E402
from comum_py.shell import kubectl  # noqa: E402
from manifests import renderizar, validar_spec  # noqa: E402

NS = "m06py-deploy"
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
PEDIDO = ARGS[0] if ARGS else (
    "Publique o serviço vitrine com a imagem nginxinc/nginx-unprivileged:1.31.6-alpine, 2 réplicas, "
    "porta 8080, escalando até 4 réplicas quando a CPU passar de 70%."
)
MANTER = "--manter" in sys.argv


def log(etapa, texto):
    print(f"[{etapa:<9}] {texto}", flush=True)


def uma_linha(texto):
    return " · ".join(texto.strip().split("\n"))


def extrair_spec(pedido):
    # JSON mode + "formulário" pequeno: ~60 tokens de saída em vez de ~400 de YAML.
    messages = [
        {
            "role": "system",
            "content": "Extraia do pedido um JSON com as chaves: nome (string), imagem (string com tag), replicas (int), "
            "porta (int), maxReplicas (int), cpuAlvo (int, %). Não invente valores que não estão no pedido: use null. "
            # Few-shot: sem este exemplo o qwen3.5:4b devolvia a imagem como "<repo:tag>" (e até "<img src=...>").
            'Exemplo de saída: {"nome":"api","imagem":"repo/app:1.2.3","replicas":1,"porta":8080,"maxReplicas":3,"cpuAlvo":60}',
        },
        {"role": "user", "content": pedido},
    ]
    # Mesmo padrão do exemplo 01: a validação do formulário reprova e o erro volta ao LLM (máx. 2 tentativas).
    for t in (1, 2):
        msg, ms, _ = chat(messages, json_mode=True, max_tokens=120)
        log("llm", f"tentativa {t}, {ms / 1000:.1f}s: {re.sub(r'\s+', ' ', msg.content)}")
        spec = extrair_json(msg.content)
        erros = validar_spec(spec)
        if not erros:
            return spec
        for e in erros:
            log("validação", f"✗ {e}")
        messages += [
            {"role": "assistant", "content": msg.content},
            {"role": "user", "content": f"Formulário inválido: {'; '.join(erros)}. Devolva o JSON corrigido."},
        ]
    return None


def implantar(spec, rotulo):
    """Aplica com portões: dry-run=server → apply → rollout status; se falhar, rollout undo."""
    erros = validar_spec(spec)
    if erros:
        for e in erros:
            log("validação", f"✗ {e}")
        return False
    log("validação", f"✓ spec ok ({rotulo})")
    manifest = renderizar(spec, NS)

    # dry-run=server: o API server roda admission, defaults e validação de schema sem persistir nada.
    dry = kubectl(["apply", "--dry-run=server", "-f", "-"], input=manifest)
    if not dry["ok"]:
        log("dry-run", f"✗ {dry['stderr'].strip()}")
        return False
    log("dry-run", f"✓ {uma_linha(dry['stdout'])}")

    ap = kubectl(["apply", "-f", "-"], input=manifest)
    log("apply", uma_linha(ap["stdout"]))

    # Portão de readiness: o rollout só "termina" quando as réplicas novas passam na readinessProbe.
    t0 = time.monotonic()
    st = kubectl(["-n", NS, "rollout", "status", f"deploy/{spec['nome']}", "--timeout=75s"])
    seg = f"{time.monotonic() - t0:.0f}"
    if st["ok"]:
        log("readiness", f"✓ pronto em {seg}s")
        return True
    log("readiness", f"✗ não ficou pronto em {seg}s: {(st['stderr'] or st['stdout']).strip().split(chr(10))[-1]}")
    pods = kubectl(["-n", NS, "get", "pods", "-l", f"app={spec['nome']}", "--no-headers",
                    "-o", "custom-columns=POD:.metadata.name,MOTIVO:.status.containerStatuses[0].state.waiting.reason"])
    log("evidência", " | ".join(pods["stdout"].strip().split("\n")))

    # Rollback automático para a revisão anterior (é aqui que o revisionHistoryLimit importa).
    undo = kubectl(["-n", NS, "rollout", "undo", f"deploy/{spec['nome']}"])
    log("rollback", undo["stdout"].strip() or undo["stderr"].strip())
    st2 = kubectl(["-n", NS, "rollout", "status", f"deploy/{spec['nome']}", "--timeout=60s"])
    log("rollback", "✓ versão anterior servindo de novo" if st2["ok"] else f"✗ rollback não estabilizou: {st2['stderr']}")
    return False


def imagem_atual(nome):
    return kubectl(["-n", NS, "get", "deploy", nome, "-o", "jsonpath={.spec.template.spec.containers[0].image}"])["stdout"]


def main():
    print(f"Pedido: {PEDIDO}\n")
    kubectl(["create", "namespace", NS])  # idempotente o suficiente: ignora "AlreadyExists"

    spec = extrair_spec(PEDIDO)
    if not spec:
        log("fim", "spec continua inválida: escalar para um humano")
        return 1
    print("\n== Release 1: versão pedida ==")
    if not implantar(spec, "release 1"):
        return 1
    hpa = kubectl(["-n", NS, "get", "hpa", spec["nome"], "--no-headers"])
    log("hpa", hpa["stdout"].strip())

    # Release 2 simulada: alguém digita a tag errada. Mudança determinística (sem LLM) para provar
    # que o portão de readiness + rollback protege o serviço.
    print("\n== Release 2: tag inexistente (falha proposital) ==")
    quebrada = {**spec, "imagem": re.sub(r":[^:]+$", ":9.9.9-nao-existe", spec["imagem"])}
    ok2 = implantar(quebrada, "release 2")
    log("estado", f"release 2 {'aprovada' if ok2 else 'revertida'}; imagem em produção: {imagem_atual(spec['nome'])}")

    if not MANTER:
        kubectl(["delete", "namespace", NS, "--wait=false"])
        log("limpeza", f"namespace {NS} removido (use --manter para inspecionar)")
    print(f"\n{resumo_uso()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
