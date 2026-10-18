"""Testes do validador de catálogo (sem LLM e sem Docker)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from promql import validar_catalogo  # noqa: E402


def test_consulta_boa_passa():
    expr = 'sum by (pod) (increase(kube_pod_container_status_restarts_total{namespace="prod"}[1h])) > 3'
    assert validar_catalogo(expr) == []


def test_metrica_alucinada():
    assert validar_catalogo('rate(http_errors_total{svc="checkout"}[5m])') == ["métrica inexistente: http_errors_total"]


def test_label_inexistente():
    assert validar_catalogo('rate(http_requests_total{pod="x"}[5m])') == ["label inexistente: pod"]
