from analisar import avaliar_headline, cobertura


def test_cobertura_conta_so_termos_que_a_vaga_pede():
    c = cobertura("Faço RAG com pgvector", "Procuramos RAG, pgvector e Kubernetes")
    assert c["presentes"] == ["RAG", "Banco vetorial"]
    assert c["ausentes"] == ["Kubernetes"]
    assert c["pct"] == 67


def test_headline_cargo_precisa_aparecer_nos_primeiros_60_caracteres():
    longe = "Apaixonado por tecnologia, café, inovação e trabalho em equipe | Engenheiro de IA"
    assert avaliar_headline(longe)["cargo_visivel"] is False
    assert avaliar_headline("Engenheiro de IA Aplicada | RAG")["cargo_visivel"] is True
