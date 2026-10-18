"""Verifica a solução (Python): escopos por tool e cota por plano. Sobe o servidor e derruba pelo PID."""

import json
import os
import subprocess
import sys
import threading
import time
from itertools import count
from pathlib import Path

import httpx2

PORT = 30381
URL_MCP = f"http://127.0.0.1:{PORT}/mcp"
_ids = count(1)


def rpc(token: str, method: str, params: dict | None = None) -> tuple[int, dict]:
    """JSON-RPC cru em modo stateless (cada POST é independente)."""
    r = httpx2.post(URL_MCP, json={"jsonrpc": "2.0", "id": next(_ids), "method": method, "params": params or {}},
                    headers={"Accept": "application/json, text/event-stream", "Authorization": f"Bearer {token}"})
    return r.status_code, r.json()


def nomes(corpo: dict) -> list[str]:
    return [t["name"] for t in corpo["result"]["tools"]]


def main(auditoria: list[str]) -> None:
    _, leitor = rpc("tok-leitor", "tools/list")
    _, editor = rpc("tok-editor", "tools/list")
    assert nomes(leitor) == ["consultar_preco"]
    assert nomes(editor) == ["consultar_preco", "ajustar_preco"]
    print("tools/list leitor:", nomes(leitor), "| editor:", nomes(editor))

    # Leitor tenta chamar a tool de escrita mesmo sem vê-la -> "não existe" para ele.
    _, tentativa = rpc("tok-leitor", "tools/call", {"name": "ajustar_preco", "arguments": {"sku": "CAF-001", "novo_preco": 1}})
    assert tentativa["result"]["isError"] is True
    print("leitor chama ajustar_preco ->", json.dumps(tentativa.get("error") or tentativa["result"], ensure_ascii=False))

    _, ajuste = rpc("tok-editor", "tools/call", {"name": "ajustar_preco", "arguments": {"sku": "CAF-001", "novo_preco": 45}})
    print("editor ajusta CAF-001 para 45 ->", ajuste["result"]["content"][0]["text"])
    _, abusivo = rpc("tok-editor", "tools/call", {"name": "ajustar_preco", "arguments": {"sku": "CAF-001", "novo_preco": 4.5}})
    assert abusivo["result"]["isError"] is True
    print("editor ajusta para 4.5 ->", abusivo["result"]["content"][0]["text"])

    # Plano free: capacidade 3 e já gastou 2 (tools/list + tentativa). Próximas: 1 passa, depois 429.
    status_free = [rpc("tok-leitor", "tools/call", {"name": "consultar_preco", "arguments": {"sku": "CAF-001"}})[0]
                   for _ in range(3)]
    assert status_free == [200, 429, 429]
    # Plano pro: capacidade 20, gastou 3 -> 10 chamadas seguidas passam.
    status_pro = [rpc("tok-editor", "tools/list")[0] for _ in range(10)]
    assert all(s == 200 for s in status_pro)
    print("free (3 chamadas):", " ".join(map(str, status_free)), "| pro (10 chamadas):", " ".join(map(str, sorted(set(status_pro)))))

    # Sem token nenhum: 401 do SDK, antes de qualquer cota.
    r = httpx2.post(URL_MCP, json={"jsonrpc": "2.0", "id": 0, "method": "tools/list"},
                    headers={"Accept": "application/json, text/event-stream"})
    assert r.status_code == 401
    time.sleep(0.2)
    print("sem token ->", r.status_code, "| auditoria:", " | ".join(auditoria))
    print("OK: escopos e cotas funcionando.")


if __name__ == "__main__":
    proc = subprocess.Popen([sys.executable, str(Path(__file__).with_name("server.py"))],
                            env={**os.environ, "PORT": str(PORT)}, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True)
    linhas: list[str] = []
    threading.Thread(target=lambda: linhas.extend(l.strip() for l in proc.stdout if l.startswith("{")), daemon=True).start()
    try:
        for _ in range(100):
            try:
                if httpx2.get(f"http://127.0.0.1:{PORT}/health").status_code == 200:
                    break
            except httpx2.TransportError:
                time.sleep(0.1)
        main(linhas)
    finally:
        proc.terminate()  # para pelo PID
        proc.wait(timeout=10)
