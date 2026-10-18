"""Mini-aplicação web de tarefas (FastAPI): UI HTML + API REST + endpoint MCP (Streamable HTTP, stateless).

A UI é o MESMO ../index.html do lado JS: o que roda no navegador não se porta.
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))  # pasta com hífen no caminho: imports dos vizinhos
from mcp_app import criar_servidor_mcp  # noqa: E402

INDEX = (Path(__file__).parent.parent / "index.html").read_text()
# Token de serviço para o MCP: o endpoint mexe no estado (resetar!), então não fica aberto.
# Em produção: OAuth/escopos como no módulo 03 (exemplo 04). Aqui, um Bearer fixo de demonstração.
MCP_TOKEN = os.environ.get("MCP_TOKEN", "tok-e2e-demo")
NAO_AUTORIZADO = {"jsonrpc": "2.0", "error": {"code": -32001, "message": "Não autorizado"}, "id": None}


class NovaTarefa(BaseModel):
    titulo: str = ""


def exigir_token(app_mcp):
    """Middleware ASGI mínimo: só /mcp exige o Bearer; o resto segue para o app do MCP (que dá 404)."""
    async def asgi(scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith("/mcp"):
            auth = dict(scope["headers"]).get(b"authorization", b"").decode()
            if auth != f"Bearer {MCP_TOKEN}":
                return await JSONResponse(NAO_AUTORIZADO, status_code=401)(scope, receive, send)
        await app_mcp(scope, receive, send)
    return asgi


def criar_app(estado, extras_mcp=None) -> FastAPI:
    mcp = criar_servidor_mcp(estado, extras=extras_mcp)
    # Stateless + JSON: cada POST é independente. host="127.0.0.1" liga a validação de Host/Origin
    # (anti DNS rebinding) no transport do SDK.
    app_mcp = mcp.streamable_http_app(stateless_http=True, json_response=True, host="127.0.0.1")

    # Sub-app montado não roda o próprio lifespan: o session manager do MCP sobe no lifespan do FastAPI.
    @asynccontextmanager
    async def lifespan(_app):
        async with mcp.session_manager.run():
            yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/", response_class=HTMLResponse)
    def index():
        return INDEX

    @app.get("/api/tarefas")
    def listar():
        return estado.listar()

    @app.post("/api/tarefas", status_code=201)
    def adicionar(corpo: NovaTarefa):
        try:
            return estado.adicionar(corpo.titulo)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e

    @app.post("/api/tarefas/{id_}/concluir")
    def concluir(id_: int):
        t = estado.concluir(id_)
        if t is None:
            raise HTTPException(404, "não encontrada")
        return t

    # Rotas do FastAPI vêm antes; o resto (inclusive POST /mcp) cai no app do MCP, atrás do token.
    app.mount("/", exigir_token(app_mcp))
    return app
