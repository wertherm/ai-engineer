"""Testes da parte determinística do agente de deploy (sem cluster, sem LLM)."""
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from manifests import renderizar, validar_spec  # noqa: E402

BOA = {"nome": "vitrine", "imagem": "nginxinc/nginx-unprivileged:1.31.6-alpine", "replicas": 2,
       "porta": 8080, "maxReplicas": 4, "cpuAlvo": 70}


def test_spec_boa_passa():
    assert validar_spec(BOA) == []


def test_latest_e_nulls_reprovam():
    erros = validar_spec({**BOA, "imagem": "nginx:latest", "porta": None})
    assert "tag :latest proibida (deploy não reprodutível)" in erros
    assert any(e.startswith("porta") for e in erros)


def test_float_inteiro_vale_como_no_js():
    # JSON "2.0" vira float no Python; no JS Number.isInteger(2.0) é true.
    assert validar_spec({**BOA, "replicas": 2.0}) == []


def test_renderiza_tres_objetos():
    docs = list(yaml.safe_load_all(renderizar(BOA, "ns")))
    assert [d["kind"] for d in docs] == ["Deployment", "Service", "HorizontalPodAutoscaler"]
    assert docs[0]["spec"]["template"]["spec"]["containers"][0]["readinessProbe"]["httpGet"]["port"] == 8080
