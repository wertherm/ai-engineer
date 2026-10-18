"""Teste ponta a ponta do MCP HTTP (versão Python): sobe o servidor, exercita cenários válidos e de abuso,
mostra o log de auditoria e derruba o servidor pelo PID."""

import asyncio
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

PORT = 30371
URL_MCP = f"http://127.0.0.1:{PORT}/mcp"
CAB = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
LISTAR = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}


def subir_servidor() -> tuple[subprocess.Popen, list[str]]:
    env = {**os.environ, "PORT": str(PORT), "RATE_LIMIT": "8", "RATE_WINDOW_MS": "60000"}
    proc = subprocess.Popen([sys.executable, str(Path(__file__).with_name("server.py"))], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    logs: list[str] = []
    # Auditoria sai no stdout em JSON Lines; uma thread coleta enquanto o teste roda.
    threading.Thread(target=lambda: logs.extend(l.strip() for l in proc.stdout if l.startswith("{")), daemon=True).start()
    for _ in range(100):
        try:
            if httpx2.get(f"http://127.0.0.1:{PORT}/health").status_code == 200:
                return proc, logs
        except httpx2.TransportError:
            time.sleep(0.1)
    raise RuntimeError("servidor não subiu")


async def cenarios(logs: list[str]) -> None:
    # 1) Client oficial com service token válido (o header vai no httpx2.AsyncClient).
    async with httpx2.AsyncClient(headers={"Authorization": "Bearer tok-copilot-demo"}) as http:
        async with Client(streamable_http_client(URL_MCP, http_client=http)) as client:
            tools = (await client.list_tools()).tools
            print("1) token válido -> tools:", ", ".join(t.name for t in tools))
            print("   quem_sou_eu ->", (await client.call_tool("quem_sou_eu", {})).content[0].text)
            est = await client.call_tool("consultar_estoque", {"sku": "MOE-010"})
            print("   consultar_estoque(MOE-010) ->", est.content[0].text)

    async with httpx2.AsyncClient() as http:
        # Requisição JSON-RPC crua (o que um atacante ou um client mal configurado faria).
        async def rpc(headers: dict[str, str]) -> httpx2.Response:
            return await http.post(URL_MCP, headers={**CAB, **headers}, json=LISTAR)

        # 2) Sem token -> 401 + WWW-Authenticate (cabeçalho padrão do Bearer/OAuth).
        r = await rpc({})
        assert r.status_code == 401
        print("2) sem token ->", r.status_code, "|", r.headers["www-authenticate"])

        # 3) Token inválido e token vencido -> 401.
        inv = await rpc({"Authorization": "Bearer chutei-um-token"})
        venc = await rpc({"Authorization": "Bearer tok-vencido"})
        assert inv.status_code == venc.status_code == 401
        print("3) token inválido ->", inv.status_code, "| token vencido ->", venc.status_code, "|",
              inv.json()["error_description"])

        # 4) Token sem o escopo exigido -> 403.
        r = await rpc({"Authorization": "Bearer tok-sem-escopo"})
        assert r.status_code == 403
        print("4) token sem escopo ->", r.status_code, "|", r.json()["error_description"])

        # 5) Rajada acima do limite (8/min por cliente) -> 429 com Retry-After.
        status, retry = [], None
        for _ in range(10):
            r = await rpc({"Authorization": "Bearer tok-ide-demo"})
            status.append(r.status_code)
            retry = r.headers.get("retry-after", retry)
        assert status.count(429) == 2
        print("5) rajada de 10 ->", " ".join(map(str, status)), f"| Retry-After: {retry}s")

        # 6) Host forjado (DNS rebinding) -> 421 Misdirected Request (o SDK JS responde 403).
        r = await rpc({"Authorization": "Bearer tok-copilot-demo", "Host": "evil.example"})
        assert r.status_code == 421
        print("6) Host forjado ->", r.status_code, "|", r.text)

        # 7) Origin de outro site (página maliciosa no navegador da vítima) -> 403.
        r = await rpc({"Authorization": "Bearer tok-copilot-demo", "Origin": "https://evil.example"})
        assert r.status_code == 403
        print("7) Origin forjado ->", r.status_code, "|", r.text)

    await asyncio.sleep(0.2)
    print(f"\nAuditoria ({len(logs)} linhas, mostrando 4):")
    tool = next(l for l in logs if '"tool": "consultar_estoque"' in l)
    nao_aut = next(l for l in logs if '"status": 401' in l)
    for linha in (logs[0], tool, nao_aut, logs[-1]):
        print(" ", linha)
    print("\nTodos os cenários passaram.")


if __name__ == "__main__":
    proc, logs = subir_servidor()
    try:
        asyncio.run(cenarios(logs))
    finally:
        proc.terminate()  # para pelo PID do processo filho
        proc.wait(timeout=10)
