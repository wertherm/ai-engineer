"""Servidor MCP (stdio) de "automações": expõe a tool notificar_time, que grava a notificação no Postgres
(m04.notificacoes_py). Mesmo padrão do módulo 03 (MCPServer do SDK mcp 2.x); aqui o foco é o AGENTE consumindo o MCP.
Lembrete: em stdio o stdout é o canal JSON-RPC, então nada de print() aqui."""

from typing import Annotated, Literal

from mcp.server import MCPServer
from pydantic import Field

from comum_py.llm import conectar, js

mcp = MCPServer("automacoes", version="1.0.0")
conn = conectar()


@mcp.tool(description="Envia uma notificação a um time (financeiro, compras ou ti).")
def notificar_time(time: Literal["financeiro", "compras", "ti"], mensagem: Annotated[str, Field(max_length=200)]) -> str:
    (id_,) = conn.execute("INSERT INTO m04.notificacoes_py (time, mensagem) VALUES (%s, %s) RETURNING id",
                          (time, mensagem)).fetchone()
    # Retorno str (sem outputSchema): o content é o JSON compacto, como no JS.
    return js({"ok": True, "id": id_, "time": time})


if __name__ == "__main__":
    mcp.run()
