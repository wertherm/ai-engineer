import json
from pathlib import Path

from priorizar import alinhamento_okr, moscow, rice, roadmap, wsjf

DADOS = json.loads((Path(__file__).resolve().parent.parent / "backlog.json").read_text(encoding="utf-8"))
ITENS, OKRS, CAP = DADOS["itens"], DADOS["okrs"], DADOS["capacidadePorSprint"]
POR_ID = {i["id"]: i for i in ITENS}


def test_rice_e_wsjf_batem_com_a_formula():
    assert rice(POR_ID["HU-01"]) == 4000 * 2 * 0.8 / 5  # 1280
    assert wsjf(POR_ID["HU-02"]) == (5 + 13 + 13) / 1  # 31


def test_regulatorio_vira_must_e_propaga_para_a_dependencia():
    c = moscow(ITENS)
    assert c["HU-02"] == "Must"
    assert c["HU-01"] == "Must"
    assert c["HU-05"] == "Won't"


def test_roadmap_respeita_dependencia_e_capacidade():
    plano = roadmap(ITENS, CAP, moscow(ITENS))
    sprint_de = lambda id_: next(n for n, s in enumerate(plano) if id_ in s)
    assert sprint_de("HU-01") < sprint_de("HU-02")
    for s in plano:
        assert sum(POR_ID[i]["jobSize"] for i in s) <= CAP


def test_alinhamento_acusa_item_sem_kr():
    assert alinhamento_okr(OKRS, ITENS)["itensSemKr"] == ["HU-05"]
