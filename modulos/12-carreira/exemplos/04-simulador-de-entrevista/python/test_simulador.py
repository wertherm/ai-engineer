import re

from simulador import avaliar_offline, banco, mulberry32, sortear


def test_banco_tem_ids_unicos_e_regex_validas():
    assert len({p["id"] for p in banco}) == len(banco)
    for p in banco:
        for k in p["pontosChave"]:
            re.compile(k["padrao"], re.IGNORECASE)  # levanta re.error se inválida


def test_mesma_seed_sorteia_as_mesmas_perguntas():
    assert [p["id"] for p in sortear(3, 12)] == [p["id"] for p in sortear(3, 12)]


def test_seed_12_bate_com_o_js():
    # Saída do `npm run ex04` (JS): o PRNG portado com aritmética de 32 bits dá a MESMA sequência.
    assert [p["id"] for p in sortear(3, 12)] == ["chunking", "falhas-do-provedor", "quando-usar-agentes"]
    assert mulberry32(12)() == mulberry32(12)()


def test_a_resposta_modelo_cobre_todos_os_seus_pontos_chave():
    for p in banco:
        assert avaliar_offline(p, p["respostaModelo"])["pct"] == 100, p["id"]
