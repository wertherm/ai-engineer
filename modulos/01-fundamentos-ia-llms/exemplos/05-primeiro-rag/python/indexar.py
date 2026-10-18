"""Exemplo 05 (Python, parte 1) — Indexação: documentos -> chunks -> embeddings -> Postgres/pgvector."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
from comum_py.rag import chunk_por_paragrafo, conectar, indexar, ler_corpus

CORPUS = Path(__file__).resolve().parents[1] / "corpus"  # o mesmo corpus do JS

with conectar() as db:
    docs = ler_corpus(CORPUS)
    chunks = [c for d in docs for c in chunk_por_paragrafo(d)]
    t0 = time.perf_counter()
    n = indexar(db, "paragrafo", chunks)
    print(f"documentos: {len(docs)} | chunks indexados: {n} | tempo: {time.perf_counter() - t0:.1f}s")
    linhas = db.execute(
        "SELECT fonte, vector_dims(embedding), left(conteudo, 60) FROM m01.chunks_py "
        "WHERE colecao = 'paragrafo' ORDER BY id LIMIT 3"
    ).fetchall()
    print(f"{'fonte':<18} dims  início")
    for fonte, dims, inicio in linhas:
        print(f"{fonte:<18} {dims}  {inicio}")
