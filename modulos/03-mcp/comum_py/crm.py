""""Empresa como MCP": a fábrica do servidor CRM/billing fica separada do transporte.

O mesmo servidor roda em stdio (exemplos/02-empresa-como-mcp/python/server.py), em HTTP ou em testes em
processo (Client(servidor)). Reutilizado nos exemplos 03 e 05 (versão Python).
"""

from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

import psycopg
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import Resource, ToolAnnotations
from psycopg.rows import dict_row
from pydantic import BaseModel, Field


class Cliente(BaseModel):
    id: int
    nome: str
    email: str
    plano: str


class Fatura(BaseModel):
    id: int
    cliente_id: int
    valor: float
    vencimento: str
    status: str


class ListaClientes(BaseModel):
    clientes: list[Cliente]


class ListaFaturas(BaseModel):
    faturas: list[Fatura]
    total: float


class FaturaPaga(BaseModel):
    fatura: Fatura


def _fatura(linha: dict[str, Any]) -> Fatura:
    # NUMERIC volta como Decimal e DATE como datetime.date (sem fuso: não tem a armadilha do Date do JS).
    valor: Decimal = linha["valor"]
    venc: date = linha["vencimento"]
    return Fatura(**{**linha, "valor": float(valor), "vencimento": venc.isoformat()})


def criar_servidor_crm(conn: psycopg.Connection) -> MCPServer:
    def consultar(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        with conn.cursor(row_factory=dict_row) as cur:
            return cur.execute(sql, params).fetchall()

    # Middleware do SDK 2.x: completa o resources/list com uma ficha por cliente, lida do banco a cada
    # chamada (no JS isso é o callback `list` do ResourceTemplate). O resultado chega como dict já no
    # formato de fio (camelCase), então as fichas entram serializadas com by_alias.
    async def listar_fichas(ctx, call_next):
        resultado = await call_next(ctx)
        if ctx.method != "resources/list" or not isinstance(resultado, dict):
            return resultado
        fichas = [Resource(uri=f"crm://clientes/{r['id']}", name=r["nome"], mime_type="application/json")
                  .model_dump(by_alias=True, mode="json", exclude_none=True)
                  for r in consultar("SELECT id, nome FROM clientes_py ORDER BY id")]
        return {**resultado, "resources": [*resultado.get("resources", []), *fichas]}

    mcp = MCPServer(
        "crm-billing",
        version="1.0.0",
        instructions="CRM e faturamento da Exemplo SA. Busque o cliente pelo nome antes de consultar faturas.",
        middleware=[listar_fichas],
    )

    @mcp.tool(title="Buscar clientes",
              description="Busca clientes pelo nome (parcial, sem diferenciar maiúsculas). Retorna id, nome, email e plano.",
              annotations=ToolAnnotations(read_only_hint=True))
    def buscar_clientes(termo: Annotated[str, Field(min_length=2, description="Parte do nome do cliente")]) -> ListaClientes:
        linhas = consultar("SELECT id, nome, email, plano FROM clientes_py WHERE nome ILIKE %s ORDER BY id", (f"%{termo}%",))
        return ListaClientes(clientes=[Cliente(**r) for r in linhas])

    @mcp.tool(title="Listar faturas",
              description="Lista as faturas de um cliente pelo id numérico. Filtro opcional por status (aberta ou paga).",
              annotations=ToolAnnotations(read_only_hint=True))
    def listar_faturas(cliente_id: Annotated[int, Field(gt=0)],
                       status: Literal["aberta", "paga"] | None = None) -> ListaFaturas:
        linhas = consultar(
            "SELECT id, cliente_id, valor, vencimento, status FROM faturas_py "
            "WHERE cliente_id = %s AND (%s::text IS NULL OR status = %s) ORDER BY vencimento",
            (cliente_id, status, status),
        )
        faturas = [_fatura(r) for r in linhas]
        return ListaFaturas(faturas=faturas, total=round(sum(f.valor for f in faturas), 2))

    # Escrita: não é read-only; é idempotente (pagar duas vezes não muda nada).
    @mcp.tool(title="Registrar pagamento", description="Marca uma fatura aberta como paga.",
              annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=True))
    def registrar_pagamento(fatura_id: Annotated[int, Field(gt=0)]) -> FaturaPaga:
        linhas = consultar("UPDATE faturas_py SET status = 'paga' WHERE id = %s "
                           "RETURNING id, cliente_id, valor, vencimento, status", (fatura_id,))
        if not linhas:
            # Erro de negócio: ToolError vira is_error=True com a mensagem; o modelo lê e pode corrigir.
            raise ToolError(f"Fatura {fatura_id} não existe.")
        return FaturaPaga(fatura=_fatura(linhas[0]))

    # Resource template: a ficha do cliente como documento que o app pode anexar ao contexto.
    @mcp.resource("crm://clientes/{id}", name="ficha_cliente", title="Ficha do cliente", mime_type="application/json")
    def ficha_cliente(id: str) -> str:
        linhas = consultar("SELECT id, nome, email, plano FROM clientes_py WHERE id = %s", (int(id),))
        return Cliente(**linhas[0]).model_dump_json() if linhas else "null"

    @mcp.prompt(title="Cobrança amigável", description="Rascunho de e-mail de cobrança")
    def cobranca_amigavel(cliente: str) -> str:
        return (f'Use as tools do CRM para achar as faturas abertas de "{cliente}" '
                "e escreva um e-mail curto e cordial de cobrança.")

    return mcp
