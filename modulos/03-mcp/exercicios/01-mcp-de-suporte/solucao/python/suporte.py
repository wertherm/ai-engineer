"""Solução do exercício 1 (Python): MCP de um serviço novo (central de suporte / tickets).

A fábrica recebe o repositório por injeção: em teste usamos memória, em produção seria o banco.
"""

from typing import Annotated, Literal

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field

Prioridade = Literal["baixa", "media", "alta"]
Status = Literal["aberto", "fechado"]


class Ticket(BaseModel):
    id: int
    cliente: str
    assunto: str
    prioridade: Prioridade
    status: Status = "aberto"
    resolucao: str | None = None


class UmTicket(BaseModel):
    ticket: Ticket


class ListaTickets(BaseModel):
    tickets: list[Ticket]


class RepositorioEmMemoria:
    def __init__(self) -> None:
        self.tickets: dict[int, Ticket] = {}

    def abrir(self, cliente: str, assunto: str, prioridade: Prioridade) -> Ticket:
        t = Ticket(id=len(self.tickets) + 1, cliente=cliente, assunto=assunto, prioridade=prioridade)
        self.tickets[t.id] = t
        return t

    def listar(self, status: Status | None) -> list[Ticket]:
        return [t for t in self.tickets.values() if status is None or t.status == status]

    def buscar(self, id: int) -> Ticket | None:
        return self.tickets.get(id)

    def fechar(self, id: int, resolucao: str) -> Ticket:
        t = self.tickets[id]
        t.status, t.resolucao = "fechado", resolucao
        return t


def criar_servidor_suporte(repo: RepositorioEmMemoria | None = None) -> MCPServer:
    repo = repo or RepositorioEmMemoria()
    mcp = MCPServer("suporte", version="1.0.0")

    @mcp.tool(description="Abre um ticket de suporte para um cliente",
              annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False))
    def abrir_ticket(cliente: Annotated[str, Field(min_length=2)],
                     assunto: Annotated[str, Field(min_length=5, max_length=200)],
                     prioridade: Prioridade = "media") -> UmTicket:
        return UmTicket(ticket=repo.abrir(cliente, assunto, prioridade))

    @mcp.tool(description="Lista tickets, opcionalmente por status", annotations=ToolAnnotations(read_only_hint=True))
    def listar_tickets(status: Status | None = None) -> ListaTickets:
        return ListaTickets(tickets=repo.listar(status))

    @mcp.tool(description="Fecha um ticket aberto registrando a resolução",
              annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=True))
    def fechar_ticket(id: Annotated[int, Field(gt=0)], resolucao: Annotated[str, Field(min_length=5)]) -> UmTicket:
        t = repo.buscar(id)
        if t is None:
            raise ToolError(f"Ticket {id} não existe.")
        if t.status == "fechado":
            raise ToolError(f"Ticket {id} já está fechado.")
        return UmTicket(ticket=repo.fechar(id, resolucao))

    @mcp.resource("suporte://tickets/{id}", name="ticket", title="Ticket", mime_type="application/json")
    def ticket(id: str) -> str:
        t = repo.buscar(int(id))
        return t.model_dump_json() if t else "null"

    return mcp
