"""Demonstra o CRM exposto via MCP: sobe o servidor por stdio e faz o fluxo de um atendente."""

import asyncio
import json
import os
import sys
from pathlib import Path

from mcp import Client, StdioServerParameters, stdio_client

from comum_py.db import DATABASE_URL, conectar, resetar_banco

# No Python o `env` é MESCLADO sobre get_default_environment() (PATH, HOME...): basta passar o que falta.
# DATABASE_URL não está na lista "segura" do SDK, então vai explícita (igual ao JS).
PARAMS = StdioServerParameters(
    command=sys.executable,
    args=[str(Path(__file__).with_name("server.py"))],
    env={"DATABASE_URL": DATABASE_URL},
)


async def demonstrar(client: Client) -> None:
    print("Instruções do servidor:", client.instructions)
    for t in (await client.list_tools()).tools:
        print(f"- {t.name} {json.dumps(t.annotations.model_dump(by_alias=True, exclude_none=True))}")

    async def chamar(nome: str, args: dict) -> dict | None:
        r = await client.call_tool(nome, args)
        texto = json.dumps(r.structured_content, ensure_ascii=False) if r.structured_content else r.content[0].text
        texto = " ".join(texto.split("\n")[:3])  # erro de validação do pydantic vem em várias linhas
        print(f"\n{nome}({json.dumps(args)}){' [ERRO]' if r.is_error else ''}\n  {texto}")
        return r.structured_content

    clientes = (await chamar("buscar_clientes", {"termo": "padaria"}))["clientes"]
    await chamar("listar_faturas", {"cliente_id": clientes[0]["id"], "status": "aberta"})
    await chamar("registrar_pagamento", {"fatura_id": 2})
    await chamar("listar_faturas", {"cliente_id": clientes[0]["id"], "status": "aberta"})
    await chamar("registrar_pagamento", {"fatura_id": 999})
    await chamar("listar_faturas", {"cliente_id": -1})  # falha na validação do pydantic

    resources = (await client.list_resources()).resources
    print("\nResources:", ", ".join(f"{r.uri} ({r.name})" for r in resources))
    print("crm://clientes/2 ->", (await client.read_resource("crm://clientes/2")).contents[0].text)


async def main() -> None:
    with conectar() as conn:  # dados de demonstração sempre iguais a cada execução
        resetar_banco(conn)
    with open(os.devnull, "w") as devnull:
        async with Client(stdio_client(PARAMS, errlog=devnull)) as client:
            await demonstrar(client)


if __name__ == "__main__":
    asyncio.run(main())
