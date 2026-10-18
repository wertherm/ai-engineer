import json
from pathlib import Path

from detector import detectar_riscos, inclinacao, z_robusto

HIST = json.loads((Path(__file__).resolve().parent.parent / "historico-sprints.json").read_text(encoding="utf-8"))


def test_z_robusto_ignora_outlier_antigo():
    assert abs(z_robusto(10, [10, 10, 11, 9, 100])) < 1


def test_inclinacao_de_reta():
    assert inclinacao([1, 2, 3, 4]) == 1


def test_sprint_12_tem_riscos_de_escopo_cronograma_e_recursos():
    tipos = [r["tipo"] for r in detectar_riscos(HIST)]
    for t in ("escopo", "cronograma", "recursos"):
        assert t in tipos, t


def test_sprint_saudavel_nao_gera_falso_positivo():
    assert detectar_riscos(HIST[:6]) == []
