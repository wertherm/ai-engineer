"""Compor MCPs: um client "agregador" conecta em vários servidores (stdio e HTTP), junta as tools com
prefixo por servidor (evita colisão de nomes) e roteia cada chamada.

Por padrão compõe os servidores PYTHON dos exemplos 02 (stdio) e 04 (HTTP). Com linguagem="js", compõe os
servidores JS do mesmo módulo: o client Python fala com eles sem mudar uma linha (interoperabilidade).
"""

import os
import subprocess
import sys
import time
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Literal

import httpx2
from mcp import Client, StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamable_http_client
from mcp.types import CallToolResult, TextContent, Tool

from comum_py.db import DATABASE_URL, conectar, resetar_banco

EXEMPLOS = Path(__file__).resolve().parents[2]
SEP = "__"


def _esperar_health(url: str) -> None:
    for _ in range(100):
        try:
            if httpx2.get(url).status_code == 200:
                return
        except httpx2.TransportError:
            time.sleep(0.1)
    raise RuntimeError(f"timeout esperando {url}")


class Composicao:
    def __init__(self, porta_catalogo: int = 30372, linguagem: Literal["py", "js"] = "py") -> None:
        self.porta, self.linguagem = porta_catalogo, linguagem
        self.tools: list[Tool] = []
        self.servidores: dict[str, Client] = {}
        self._pilha = AsyncExitStack()
        self._proc: subprocess.Popen | None = None

    def _comando(self, rel_py: str, rel_js: str) -> list[str]:
        return [sys.executable, str(EXEMPLOS / rel_py)] if self.linguagem == "py" else ["node", str(EXEMPLOS / rel_js)]

    async def __aenter__(self) -> "Composicao":
        if self.linguagem == "py":
            with conectar() as conn:
                resetar_banco(conn)
        else:  # o seed do JS fica no db.js (tabelas m03.clientes/faturas)
            subprocess.run(["node", str(EXEMPLOS / "02-empresa-como-mcp/db.js")], check=True, capture_output=True)

        # Servidor 1: CRM/billing local, via stdio (exemplo 02).
        cmd = self._comando("02-empresa-como-mcp/python/server.py", "02-empresa-como-mcp/server.js")
        devnull = self._pilha.enter_context(open(os.devnull, "w"))
        params = StdioServerParameters(command=cmd[0], args=cmd[1:], env={"DATABASE_URL": DATABASE_URL})
        crm = await self._pilha.enter_async_context(Client(stdio_client(params, errlog=devnull)))

        # Servidor 2: catálogo remoto via Streamable HTTP com service token (exemplo 04), subido como processo
        # filho só para o exemplo ser autocontido.
        cmd = self._comando("04-mcp-http-producao/python/server.py", "04-mcp-http-producao/server.js")
        self._proc = subprocess.Popen(cmd, env={**os.environ, "PORT": str(self.porta), "RATE_LIMIT": "100"},
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _esperar_health(f"http://127.0.0.1:{self.porta}/health")
        token = os.environ.get("CATALOGO_TOKEN", "tok-copilot-demo")
        http = await self._pilha.enter_async_context(httpx2.AsyncClient(headers={"Authorization": f"Bearer {token}"}))
        catalogo = await self._pilha.enter_async_context(
            Client(streamable_http_client(f"http://127.0.0.1:{self.porta}/mcp", http_client=http)))

        self.servidores = {"crm": crm, "catalogo": catalogo}
        for prefixo, client in self.servidores.items():
            for t in (await client.list_tools()).tools:
                self.tools.append(t.model_copy(update={"name": f"{prefixo}{SEP}{t.name}"}))
        return self

    async def chamar(self, nome: str, args: dict) -> CallToolResult:
        """Roteia "crm__buscar_clientes" para o client "crm" com o nome original."""
        prefixo, _, original = nome.partition(SEP)
        client = self.servidores.get(prefixo)
        if client is None:
            return CallToolResult(is_error=True, content=[TextContent(type="text", text=f"Servidor desconhecido: {prefixo}")])
        return await client.call_tool(original, args)

    async def __aexit__(self, *exc) -> None:
        try:
            await self._pilha.aclose()
        finally:
            if self._proc:
                self._proc.terminate()  # para pelo PID
                self._proc.wait(timeout=10)
