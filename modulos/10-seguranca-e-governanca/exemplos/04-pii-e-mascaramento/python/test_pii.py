"""Mesmos casos de `pii.test.js`: o Python tem de dar exatamente o mesmo resultado.

CPFs e cartões abaixo são de TESTE: gerados para passar no dígito verificador / Luhn, não pertencem a ninguém.
"""
from pii import cpf_valido, desmascarar, luhn_valido, mascarar


def test_cpf_digito_verificador():
    assert cpf_valido("529.982.247-25") is True
    assert cpf_valido("52998224725") is True
    assert cpf_valido("529.982.247-24") is False  # DV errado
    assert cpf_valido("111.111.111-11") is False  # todos iguais passam no DV, mas são inválidos


def test_cartao_luhn():
    assert luhn_valido("4111 1111 1111 1111") is True  # número de teste clássico
    assert luhn_valido("4111 1111 1111 1112") is False


def test_mascara_cpf_email_telefone_e_cartao():
    r = mascarar("Sou Ana, CPF 529.982.247-25, ana.souza@exemplo.com.br, cel (11) 98765-4321, cartão 4111-1111-1111-1111.")
    assert r["texto"] == "Sou Ana, CPF [CPF_1], [EMAIL_1], cel [TELEFONE_1], cartão [CARTAO_1]."
    assert r["contagem"] == {"EMAIL": 1, "CARTAO": 1, "CPF": 1, "TELEFONE": 1}


def test_nao_mascara_numero_que_so_parece_cpf_ou_cartao():
    t = "Pedido 123.456.789-00 e boleto 1234 5678 9012 3456."
    assert mascarar(t)["texto"] == t


def test_mesmo_valor_mesmo_marcador_e_desmascarar_recupera_o_original():
    original = "CPF 52998224725 e de novo 52998224725; outro: 168.995.350-09"
    r = mascarar(original)
    assert r["texto"] == "CPF [CPF_1] e de novo [CPF_1]; outro: [CPF_2]"
    assert desmascarar(r["texto"], r["cofre"]) == original


def test_telefone_com_mais_55_e_fixo_com_ddd():
    assert mascarar("Ligue +55 21 99876-5432 ou (31) 3456-7890.")["texto"] == "Ligue [TELEFONE_1] ou [TELEFONE_2]."


def test_desmascarar_parcial_cartao_volta_so_com_os_4_ultimos_digitos():
    r = mascarar("cartão 4111 1111 1111 1111, e-mail a@b.com")
    assert desmascarar(r["texto"], r["cofre"], parciais=("CARTAO",)) == "cartão ****1111, e-mail a@b.com"


def test_digitos_unicode_nao_viram_pii():
    # Exclusivo do Python: sem re.ASCII, "\d" casaria dígitos árabe-índicos (٥٢٩...) e "\w" o "é",
    # e os dois virariam PII aqui, diferente do JS (que devolve o texto intacto e contagem vazia).
    t = "CPF ٥٢٩٩٨٢٢٤٧٢٥ e josé@exemplo.com"
    r = mascarar(t)
    assert r["texto"] == t
    assert r["contagem"] == {}
