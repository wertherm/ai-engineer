from estimativa import etapa_mais_cara, total


def test_total_soma_as_etapas_e_a_sugestao_com_rag_e_a_mais_cara():
    t = total()
    soma = sum(e["custo_mes"] for e in t["por_etapa"].values())
    assert abs(t["custo_mes"] - soma) < 1e-9
    assert etapa_mais_cara(t) == "sugerir"
