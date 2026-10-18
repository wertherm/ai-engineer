"""Testes do approval gate (função pura, sem banco nem LLM)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gate import avaliar, carregar_politica  # noqa: E402

politica = carregar_politica()


def decisao(acao: dict) -> str:
    return avaliar(acao, politica)[0]


def test_alta_confianca_e_valor_baixo_passa_direto():
    assert decisao({"tipo": "reenviar_boleto", "valor": 100, "confianca": 0.99}) == "automatica"


def test_confianca_abaixo_do_limiar_vai_para_humano():
    assert decisao({"tipo": "reenviar_boleto", "valor": 100, "confianca": 0.5}) == "pendente"


def test_confianca_alta_nao_libera_acao_sensivel_nem_valor_alto():
    assert decisao({"tipo": "cancelar_operacao", "confianca": 1}) == "pendente"
    assert decisao({"tipo": "conceder_desconto", "valor": 99999, "confianca": 1}) == "pendente"


def test_acao_proibida_e_bloqueada_antes_de_tudo():
    assert decisao({"tipo": "excluir_cliente", "confianca": 1}) == "bloqueada"
