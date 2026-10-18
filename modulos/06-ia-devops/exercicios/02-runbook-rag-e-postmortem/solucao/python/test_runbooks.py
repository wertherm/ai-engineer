"""Testes dos guardrails do agente de runbooks (sem cluster, sem LLM, sem banco)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from solucao import RUNBOOKS, parse_runbook, preparar_comando  # noqa: E402

VARS = {"namespace": "m06py-runbook", "app": "relatorios"}


def test_parse_extrai_comandos_da_mitigacao():
    rb = parse_runbook((RUNBOOKS / "01-pod-oomkilled.md").read_text())
    assert rb["secoes"]["Mitigação"]["comandos"] == [
        "kubectl -n {{namespace}} set resources deploy/{{app}} --limits=memory=128Mi --requests=memory=64Mi"
    ]
    assert "OOMKilled" in rb["secoes"]["Sintoma"]["texto"]


def test_delete_fora_da_allowlist():
    rb = parse_runbook((RUNBOOKS / "04-certificado-expirando.md").read_text())
    erros = [preparar_comando(l, VARS).get("erro") for l in rb["secoes"]["Mitigação"]["comandos"]]
    assert 'verbo "delete" fora da allowlist' in erros


def test_namespace_e_variavel_sem_valor():
    assert preparar_comando("kubectl -n prod get pods", VARS) == {"erro": "comando fora do namespace do alerta"}
    assert preparar_comando("kubectl -n {{namespace}} get pod {{pod}}", VARS)["erro"].startswith("variável sem valor")
