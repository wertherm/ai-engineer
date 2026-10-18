"""Prepara o ambiente de demonstração: migra o schema m11 (tabelas _py), cria os 2 tenants e indexa os
documentos. Idempotente. Uso: uv run python -m app_py.seed"""

import asyncio
import time

from .corpus import ler_documentos
from .db import criar_pool, migrar
from .llm import criar_llm
from .servico import criar_servico
from .tenants import TENANTS_DEMO, salvar_tenant


async def seed(pool, llm, log=print) -> None:
    await migrar(pool)
    servico = criar_servico(pool=pool, llm=llm)
    for t in TENANTS_DEMO:
        await salvar_tenant(pool, **t)
        for doc in ler_documentos(t["id"]):
            r = await servico.indexar(t, doc, canal="seed")
            log(f"[seed] {t['id']:<8} {r['fonte']:<28} {r['chunks']} chunks")


async def main() -> None:
    pool = await criar_pool()
    t0 = time.perf_counter()
    try:
        await seed(pool, criar_llm())
        print(f"[seed] pronto em {time.perf_counter() - t0:.1f}s")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
