import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from roteador import rotear, tier_ideal  # noqa: E402

COMPLEXA = "Compare CCB e antecipação com prós e contras"


def test_classifica_os_tres_tiers_pela_intencao():
    assert tier_ideal("Qual a taxa?") == "barato"
    assert tier_ideal("Explique como funciona o CDI") == "medio"
    assert tier_ideal(COMPLEXA) == "caro"


def test_abaixo_do_alerta_usa_o_tier_ideal():
    assert rotear(COMPLEXA, 1)[0] == "caro"


def test_entre_80_e_100_por_cento_desce_um_degrau():
    assert rotear(COMPLEXA, 4.5)[0] == "medio"
    assert rotear("Qual a taxa?", 4.5)[0] == "barato"


def test_orcamento_esgotado_recusa():
    assert rotear("Qual a taxa?", 5) == (None, "orçamento esgotado")
