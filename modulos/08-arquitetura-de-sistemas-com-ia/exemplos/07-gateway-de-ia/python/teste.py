"""Sobe o gateway Python como processo filho, dispara cenários e derruba pelo PID (nunca pkill)."""

import asyncio
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx

from gateway import PORTA

BASE = f"http://127.0.0.1:{PORTA}"
gw = subprocess.Popen([sys.executable, str(Path(__file__).with_name("gateway.py"))],
                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
logs: list[str] = []
threading.Thread(target=lambda: logs.extend(l.rstrip() for l in gw.stdout), daemon=True).start()


def esperar_no_ar(limite_s: float = 20) -> None:
    fim = time.time() + limite_s
    while time.time() < fim:
        try:
            if httpx.get(f"{BASE}/health").status_code == 200:
                return
        except httpx.ConnectError:
            time.sleep(0.2)
    raise RuntimeError("gateway não subiu")


async def chamar(cli: httpx.AsyncClient, tenant: str, corpo: dict, traceparent: str | None = None):
    r = await cli.post("/v1/chat", json=corpo, headers={"x-tenant": tenant, **({"traceparent": traceparent} if traceparent else {})})
    return r.status_code, r.headers.get("x-trace-id"), json.dumps(r.json(), ensure_ascii=False, separators=(",", ":"))


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE, timeout=900) as cli:
        tp = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        print("1) loja-a, tier barato, com traceparent do chamador:")
        s, t, c = await chamar(cli, "loja-a", {"mensagem": "Defina CDI em 5 palavras."}, tp)
        print(f"   {s} trace={t} → {c}")

        print("2) free pedindo tier caro (política):")
        s, _, c = await chamar(cli, "free", {"mensagem": "oi", "tier": "caro"})
        print(f"   {s} → {c}")

        print("3) free, rajada de 3 pedidos simultâneos (balde com 1 ficha):")
        rajada = await asyncio.gather(*(chamar(cli, "free", {"mensagem": f"Diga apenas o número {i}."}) for i in (1, 2, 3)))
        for s, _, c in rajada:
            print(f"   {s} → {c}")

        print("4) tenant desconhecido:")
        print(f"   {(await chamar(cli, 'hacker', {'mensagem': 'oi'}))[0]}")

        await asyncio.sleep(0.2)  # dá tempo de a thread ler as últimas linhas de log
        print("\nLogs estruturados do gateway (stdout):")
        for l in logs:
            print(f"   {l}")
        print("\nGET /metrics:")
        for l in (await cli.get("/metrics")).text.strip().splitlines():
            print(f"   {l}")


try:
    esperar_no_ar()
    asyncio.run(main())
finally:
    gw.terminate()  # pelo PID do filho
    gw.wait(timeout=10)
