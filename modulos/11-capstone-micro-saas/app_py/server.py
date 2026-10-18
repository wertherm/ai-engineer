"""Ponto de entrada da API Python (local ou no container): migra o schema, monta as dependências reais e
sobe o uvicorn. Uso (da pasta do módulo): uv run python -m app_py.server  (porta 31150 por padrão)."""

import logging
import os
from contextlib import asynccontextmanager

import uvicorn

from . import config
from .api import build_app
from .db import migrar, novo_pool
from .llm import criar_llm
from .servico import criar_servico
from .tenants import criar_autenticador


def criar_app_real():
    pool = novo_pool()  # o pool assíncrono só abre dentro do event loop do uvicorn: no lifespan

    @asynccontextmanager
    async def lifespan(_app):
        await pool.open(wait=True)
        await migrar(pool)
        yield
        await pool.close()  # encerramento gracioso: docker stop manda SIGTERM, o uvicorn roda o fim do lifespan

    return build_app(servico=criar_servico(pool=pool, llm=criar_llm()), autenticar=criar_autenticador(pool), lifespan=lifespan)


app = criar_app_real()

if __name__ == "__main__":
    nivel = os.environ.get("LOG_LEVEL", "info").lower()
    logging.basicConfig(level=nivel.upper(), format="%(asctime)s %(name)s %(levelname)s %(message)s")
    uvicorn.run(app, host=config.HOST, port=config.PORTA, log_level=nivel, access_log=nivel in ("info", "debug"))
