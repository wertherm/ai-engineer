"""Helpers de cliente MCP (HTTP + Bearer) e da "mini-host" que renderiza o recurso de UI (MCP Apps)."""

import json
from contextlib import asynccontextmanager

import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from app import MCP_TOKEN


@asynccontextmanager
async def conectar_mcp(base_url: str):
    # No SDK Python 2.x o header vai no httpx2.AsyncClient (não há requestInit como no JS).
    async with httpx2.AsyncClient(headers={"Authorization": f"Bearer {MCP_TOKEN}"}) as http:
        async with Client(streamable_http_client(f"{base_url}/mcp", http_client=http)) as client:
            yield client


async def chamar(client, nome: str, args: dict | None = None):
    """Chama uma tool e devolve o JSON do 1º bloco de texto (todas as tools da app respondem JSON)."""
    r = await client.call_tool(nome, args or {})
    texto = r.content[0].text if r.content else ""
    if r.is_error:
        raise RuntimeError(f"{nome}: {texto}")
    return json.loads(texto)


HOST_HTML = ('<!doctype html><html lang="pt-BR"><head><title>Host</title></head><body>'
             '<iframe id="app" title="Painel MCP" sandbox="allow-scripts" style="width:100%;height:300px"></iframe></body></html>')


async def renderizar_recurso_ui(page, client, uri: str):
    """Mini-host MCP Apps: põe o HTML do recurso num iframe sandbox (sem allow-same-origin) e repassa ao
    servidor MCP os `tools/call` que o iframe pedir. Versão mínima do que AppBridge/AppRenderer fazem,
    sem o handshake ui/initialize: suficiente para testar o recurso de ponta a ponta."""
    recurso = (await client.read_resource(uri)).contents[0]
    chamadas: list[str] = []

    async def repassar_ao_mcp(msg):
        chamadas.append(msg["params"]["name"])
        r = await client.call_tool(msg["params"]["name"], msg["params"].get("arguments", {}))
        return r.content[0].text if r.content else None

    await page.expose_function("repassarAoMcp", repassar_ao_mcp)
    await page.set_content(HOST_HTML)
    # Este trecho roda no navegador da "host" (JS): escuta o postMessage do iframe.
    await page.evaluate("""html => {
      window.addEventListener('message', (e) => { if (e.data?.method === 'tools/call') window.repassarAoMcp(e.data); });
      document.getElementById('app').srcdoc = html;
    }""", recurso.text)
    return recurso, chamadas, page.frame_locator("#app")
