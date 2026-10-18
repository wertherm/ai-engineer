"""Demo de composição: um único catálogo de tools vindo de 2 servidores MCP diferentes.

    uv run python exemplos/05-testar-e-compor/python/compor.py        # servidores Python
    uv run python exemplos/05-testar-e-compor/python/compor.py js     # mesmos servidores, versão JS
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from composicao import Composicao  # noqa: E402


async def main(linguagem: str) -> None:
    async with Composicao(linguagem=linguagem) as mcp:
        print(f"Servidores {linguagem.upper()} | protocolo crm={mcp.servidores['crm'].protocol_version}, "
              f"catalogo={mcp.servidores['catalogo'].protocol_version}")
        print(f"Tools agregadas ({len(mcp.tools)}):")
        for t in mcp.tools:
            print(" -", t.name)

        # Fluxo que cruza os dois sistemas: cliente do CRM + produto do catálogo.
        cli = await mcp.chamar("crm__buscar_clientes", {"termo": "oficina"})
        cliente = cli.structured_content["clientes"][0]
        est = json.loads((await mcp.chamar("catalogo__consultar_estoque", {"sku": "MOE-010"})).content[0].text)
        decisao = "pode vender" if est["estoque"] > 0 else "sem estoque"
        print(f"\n{cliente['nome']} (plano {cliente['plano']}) quer 1 moedor: preço R$ {est['preco']:g}, "
              f"estoque {est['estoque']} -> {decisao}")

        r = await mcp.chamar("erp__emitir_nf", {})
        print("Servidor inexistente ->", r.content[0].text)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "py"))
