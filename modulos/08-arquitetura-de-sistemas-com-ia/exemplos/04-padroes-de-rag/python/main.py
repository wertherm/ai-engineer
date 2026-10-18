"""Exemplo 04 (Python) · Padrões de RAG medidos: Basic × Hybrid Search (RRF) × Multi-Index, com recall@k."""

import time

from buscas import busca_hibrida, busca_multi_indice_federada, busca_vetorial, criar_busca_multi_indice
from corpus import INDICES, PERGUNTAS, com_instrucao, indexar

from comum_py.llm import conectar, embed, fixo, tabela

with conectar() as conn:
    indexar(conn)
    embs_perguntas = embed([com_instrucao(q) for q, _ in PERGUNTAS])
    embs_indices = embed([com_instrucao(d) for d in INDICES.values()])
    ESTRATEGIAS = {
        "basic": busca_vetorial,
        "hybrid": busca_hibrida,
        "multi-index federado": busca_multi_indice_federada,
        "multi-index roteado": criar_busca_multi_indice(dict(zip(INDICES, embs_indices))),
    }

    linhas = []
    for nome, buscar in ESTRATEGIAS.items():
        hit1 = hit3 = 0
        ms = 0.0
        erros = []
        for (q, gabarito), emb in zip(PERGUNTAS, embs_perguntas):
            t0 = time.perf_counter()
            ids = buscar(conn, q, emb, 3)
            ms += (time.perf_counter() - t0) * 1000
            hit1 += ids[0] == gabarito
            hit3 += gabarito in ids
            if ids[0] != gabarito:
                erros.append(f"{gabarito}→{ids[0]}")
        n = len(PERGUNTAS)
        linhas.append({"estrategia": nome, "recall@1": f"{hit1}/{n}", "recall@3": f"{hit3}/{n}",
                       "ms/consulta": fixo(ms / n, 1), "erros no top-1 (gabarito→veio)": " ".join(erros) or "-"})
    print(tabela(linhas))
