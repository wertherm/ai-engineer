"""Client MCP: sobe o servidor como processo filho (stdio), faz o handshake e usa tudo que ele expõe.

No SDK 2.x o `Client` de alto nível recebe um StdioServerParameters (stdio), uma URL (Streamable HTTP),
um transport, ou o próprio MCPServer (em processo, ótimo para testes) e faz o handshake no `async with`.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from mcp import Client, StdioServerParameters, stdio_client

PARAMS = StdioServerParameters(command=sys.executable, args=[str(Path(__file__).with_name("server.py"))])


async def demonstrar(client: Client) -> None:
    info = client.server_info
    print("Servidor:", {"name": info.name, "version": info.version}, "| protocolo:", client.protocol_version)
    caps = client.server_capabilities.model_dump(exclude_none=True)
    print("Capabilities:", ", ".join(sorted(caps)))

    print("\nTools:")
    for t in (await client.list_tools()).tools:
        print(f"- {t.name}: {t.description} | schema: {json.dumps(t.input_schema['properties'], ensure_ascii=False)}")

    soma = await client.call_tool("somar", {"a": 2, "b": 40})
    print("\nsomar(2, 40) -> structured_content:", json.dumps(soma.structured_content))

    dia = await client.call_tool("dia_da_semana", {"data": "2026-10-16"})
    print("dia_da_semana ->", dia.content[0].text)

    # Argumento inválido: o pydantic recusa e o SDK devolve is_error=True (não lança exceção).
    invalido = await client.call_tool("somar", {"a": "dois", "b": 1})
    print('somar("dois", 1) -> is_error:', invalido.is_error, "|", invalido.content[0].text[:70].replace("\n", " "))

    # Tool inexistente: o MCPServer também devolve is_error=True (o SDK JS devolve erro -32602).
    inexistente = await client.call_tool("multiplicar", {"a": 1, "b": 2})
    print("multiplicar (não existe) -> is_error:", inexistente.is_error, "|", inexistente.content[0].text)

    resources = (await client.list_resources()).resources
    templates = (await client.list_resource_templates()).resource_templates
    print("\nResources:", ", ".join(str(r.uri) for r in resources), "| templates:",
          ", ".join(t.uri_template for t in templates))
    print("info://sobre ->", (await client.read_resource("info://sobre")).contents[0].text)
    print("saudacao://Werther ->", (await client.read_resource("saudacao://Werther")).contents[0].text)

    prompts = (await client.list_prompts()).prompts
    print("\nPrompts:", ", ".join(f"{p.name}({','.join(a.name for a in p.arguments or [])})" for p in prompts))
    prompt = await client.get_prompt("revisar_codigo", {"codigo": "let x = 1"})
    print("revisar_codigo ->", json.dumps(prompt.messages[0].content.text, ensure_ascii=False))


async def main() -> None:
    # Client(PARAMS) já funcionaria; usamos stdio_client explícito só para descartar o stderr do filho
    # (errlog), como o stderr: 'ignore' do JS. Tem que ser um arquivo de verdade (com fileno).
    with open(os.devnull, "w") as devnull:
        async with Client(stdio_client(PARAMS, errlog=devnull)) as client:
            await demonstrar(client)


if __name__ == "__main__":
    asyncio.run(main())
