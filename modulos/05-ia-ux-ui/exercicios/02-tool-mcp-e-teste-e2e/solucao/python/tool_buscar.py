"""Tool nova: buscar_tarefas (filtro por texto e por status). Registrada SEM editar o exemplo 03: usamos o
gancho `extras_mcp` de criar_app(), que repassa (mcp, estado) para esta função."""

import json
import unicodedata
from typing import Annotated

from mcp.types import ToolAnnotations
from pydantic import Field


def sem_acento(s: str) -> str:
    # NFD separa letra e acento; descartamos as marcas combinantes ("Café" -> "Cafe").
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower()


def registrar_buscar_tarefas(mcp, estado) -> None:
    @mcp.tool(description="Busca tarefas por trecho do título (sem diferenciar maiúsculas/acentos) e/ou status",
              annotations=ToolAnnotations(read_only_hint=True), structured_output=False)
    def buscar_tarefas(
        texto: Annotated[str | None, Field(max_length=80)] = None,
        # strict=True: sem ele o pydantic aceitaria "true"/"yes"/"1" como booleano (o zod do JS não aceita).
        concluida: Annotated[bool | None, Field(strict=True)] = None,
    ) -> str:
        achadas = [t for t in estado.listar()
                   if (texto is None or sem_acento(texto) in sem_acento(t["titulo"]))
                   and (concluida is None or t["concluida"] is concluida)]
        return json.dumps(achadas, ensure_ascii=False, separators=(",", ":"))
