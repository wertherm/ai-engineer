from dataclasses import replace

from capacidade import armazenamento, estimar
from main import PREMISSAS


def test_volume_e_pico_do_cenario_base():
    e = estimar(PREMISSAS)
    assert e["req_dia"] == 24_000
    assert abs(e["rps_pico"] - 2) < 1e-9  # 24.000 / 36.000 s × 3
    assert abs(e["concorrencia_pico"] - 12) < 1e-9  # 2 req/s × 6 s
    assert e["tokens_saida_por_segundo_pico"] == 500


def test_custo_sobe_linearmente_com_chamadas_ao_llm():
    um = estimar(PREMISSAS)["custo_mes"]
    quatro = estimar(replace(PREMISSAS, chamadasLLM=4))["custo_mes"]
    assert abs(quatro - 4 * um) < 1e-6


def test_armazenamento_1_milhao_de_vetores_de_1024_dims_float32():
    a = armazenamento(documentos=1_000_000, trechosPorDoc=1, dimensoes=1024, bytesTextoPorTrecho=0)
    assert abs(a["gb_vetores"] - 4.096) < 1e-9
