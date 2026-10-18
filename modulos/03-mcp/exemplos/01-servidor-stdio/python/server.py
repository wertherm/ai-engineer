"""Servidor MCP mínimo via stdio: 2 tools, 1 resource fixo, 1 resource template e 1 prompt.

IMPORTANTE: em stdio, o stdout é o canal JSON-RPC. Qualquer print() quebra o protocolo,
por isso logs vão para o stderr.

No SDK `mcp` 2.x a classe de alto nível se chama MCPServer (era FastMCP na 1.x). O schema
de cada tool sai das anotações de tipo: `a: float` já É o JSON Schema, e o pydantic valida.
"""

import json
import sys
from datetime import date
from typing import Annotated

from mcp.server import MCPServer
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field

mcp = MCPServer("ola-mcp", version="1.0.0")


class Resultado(BaseModel):
    resultado: float


# Tool: ação que o modelo pode pedir. O retorno tipado (BaseModel) vira outputSchema
# e o SDK devolve content (texto) + structured_content (JSON) automaticamente.
@mcp.tool(title="Somar", description="Soma dois números", annotations=ToolAnnotations(read_only_hint=True))
def somar(a: float, b: float) -> Resultado:
    return Resultado(resultado=a + b)


DIAS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]


@mcp.tool(title="Dia da semana", description="Diz o dia da semana de uma data ISO (AAAA-MM-DD)")
def dia_da_semana(data: Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]) -> str:
    # Sem locale: weekday() é determinístico (0 = segunda), independente do idioma da máquina.
    return f"{data} cai numa {DIAS[date.fromisoformat(data).weekday()]}"


# Resource fixo: dado somente leitura, escolhido pela aplicação/usuário (não pelo modelo).
@mcp.resource("info://sobre", name="sobre", title="Sobre o servidor", description="Metadados do servidor",
              mime_type="application/json")
def sobre() -> str:
    return json.dumps({"empresa": "Exemplo SA", "versao": "1.0.0"})


# Resource template: a variável {nome} da URI vira parâmetro da função.
@mcp.resource("saudacao://{nome}", name="saudacao", title="Saudação", description="Saudação personalizada")
def saudacao(nome: str) -> str:
    return f"Olá, {nome}! Bem-vindo ao MCP."


# Prompt: template reutilizável que o usuário escolhe (ex.: slash command no client).
@mcp.prompt(title="Revisar código", description="Pede uma revisão de código")
def revisar_codigo(codigo: str) -> str:
    return f"Revise este código e aponte bugs:\n\n{codigo}"


if __name__ == "__main__":
    print("[ola-mcp] servidor pronto no stdio", file=sys.stderr)
    mcp.run()  # transport padrão: stdio
