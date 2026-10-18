"""Teste do chunking por parágrafo (puro, sem banco nem embeddings)."""

from comum_py.rag import chunk_por_paragrafo


def test_cada_paragrafo_vira_um_chunk_prefixado_com_o_titulo():
    doc = {"fonte": "x.md", "titulo": "Política X", "texto": "# Política X\n\nPrimeiro.\n\nSegundo.\n"}
    assert chunk_por_paragrafo(doc) == [
        {"fonte": "x.md", "conteudo": "Política X: Primeiro."},
        {"fonte": "x.md", "conteudo": "Política X: Segundo."},
    ]
