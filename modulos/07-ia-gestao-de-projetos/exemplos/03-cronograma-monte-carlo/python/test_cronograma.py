import pytest

from cronograma import cpm, monte_carlo_throughput, mulberry32, ordem_topologica, triangular

TAREFAS = [
    {"id": "A", "provavel": 3, "dependeDe": []},
    {"id": "B", "provavel": 2, "dependeDe": []},
    {"id": "C", "provavel": 4, "dependeDe": ["A", "B"]},
]


def test_cpm_acha_o_caminho_critico_e_a_folga():
    r = cpm(TAREFAS)
    assert r["fim"] == 7
    assert r["critico"] == ["A", "C"]
    assert r["tarefas"]["B"]["folga"] == 1


def test_ciclo_de_dependencia_e_erro():
    with pytest.raises(ValueError, match="Ciclo"):
        ordem_topologica([{"id": "X", "dependeDe": ["Y"]}, {"id": "Y", "dependeDe": ["X"]}])


def test_triangular_fica_dentro_do_intervalo():
    r = mulberry32(1)
    for _ in range(1000):
        assert 2 <= triangular(r, 2, 3, 8) <= 8


def test_throughput_constante_da_previsao_exata():
    assert monte_carlo_throughput([5], 20) == {"p50": 4, "p85": 4, "p95": 4}


def test_mulberry32_igual_ao_js():
    # Primeiros valores do mulberry32(42) calculados no Node (cronograma.js): a sequência tem de ser idêntica.
    r = mulberry32(42)
    assert [r() for _ in range(3)] == [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]


def test_monte_carlo_reproduz_o_js_bit_a_bit():
    # P50/P85/P95 exatos impressos pelo Node para projeto.json (semente 42): mesmo PRNG, mesma ordem de sorteios.
    import json
    from pathlib import Path

    from cronograma import em_dias_corridos, monte_carlo_duracao

    p = json.loads((Path(__file__).resolve().parent.parent / "projeto.json").read_text(encoding="utf-8"))
    mc = monte_carlo_duracao(em_dias_corridos(p["tarefas"], p["pessoas"]))
    assert (mc["p50"], mc["p85"], mc["p95"]) == (14.555358611650355, 16.46508020144106, 17.616741258077038)
