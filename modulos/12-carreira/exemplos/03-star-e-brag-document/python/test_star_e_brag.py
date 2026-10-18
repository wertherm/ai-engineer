import json
from pathlib import Path

from caso_de_promocao import montar_caso, variacao
from validar_star import validar_star

PASTA = Path(__file__).resolve().parent.parent


def ler_json(nome):
    return json.loads((PASTA / nome).read_text(encoding="utf-8"))


def test_historia_boa_passa_e_a_fraca_falha():
    boa, fraca = ler_json("historias.json")
    assert validar_star(boa)["ok"] is True
    assert validar_star(fraca)["ok"] is False
    assert validar_star(fraca)["checagens"]["ação na 1ª pessoa do singular"] is False


def test_caso_de_promocao_calcula_variacao_e_acha_lacunas():
    assert variacao(45, 8) == "45 → 8 (-82%)"
    assert montar_caso(ler_json("brag.json"))["lacunas"] == ["execucao"]


def test_plural_com_acento_segue_a_semantica_do_js():
    # No JS, "faríamos" não casa \w{3,}amos (o "í" não é \w). Sem re.ASCII o Python contaria 1 plural.
    h = {"situacao": "a b c d", "tarefa": "a b c d", "acao": "eu medi e eu vi; faríamos e cantaríamos", "resultado": "1 aprendi x y"}
    assert validar_star(h)["checagens"]["ação na 1ª pessoa do singular"] is True
