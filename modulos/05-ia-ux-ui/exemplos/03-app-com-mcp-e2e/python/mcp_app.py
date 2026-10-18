"""Servidor MCP da aplicação (SDK `mcp` 2.3.0): expõe o estado e as ações da UI como tools, para agentes
e testes E2E, e um recurso de UI interativo (MCP Apps).

MCP Apps em Python: o pacote oficial `mcp-ui-server` 1.0.0 (nov/2025) gera `text/html` (MCP-UI antigo) e
nem importa com o mcp 2.x (o `uri` virou AnyUrl). Não precisa: o próprio SDK 2.3.0 traz a extensão em
`mcp.server.apps` (Apps, APP_MIME_TYPE = "text/html;profile=mcp-app", `_meta.ui.resourceUri`).
"""

import json
from collections.abc import Callable
from typing import Annotated

from mcp.server import MCPServer
from mcp.server.apps import Apps
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.mcpserver.resources import FunctionResource
from mcp.types import ToolAnnotations
from pydantic import Field

from painel import html_painel

URI_PAINEL = "ui://tarefas/painel"
LEITURA = ToolAnnotations(read_only_hint=True)


def para_json(dados) -> str:
    # Igual ao JSON.stringify do JS: compacto e sem escapar acentos.
    return json.dumps(dados, ensure_ascii=False, separators=(",", ":"))


def criar_servidor_mcp(estado, extras: Callable[[MCPServer, object], None] | None = None) -> MCPServer:
    """`extras(mcp, estado)` permite registrar tools novas (ex.: o exercício 02) sem copiar este arquivo."""
    apps = Apps()
    # FunctionResource: o HTML é montado a cada resources/read (reflete o estado atual). Sem mime_type
    # explícito, Apps.add_resource serve como text/html;profile=mcp-app.
    apps.add_resource(FunctionResource(uri=URI_PAINEL, name="painel_tarefas", description="Painel interativo das tarefas",
                                       fn=lambda: html_painel(estado.listar())))

    @apps.tool(resource_uri=URI_PAINEL, description="Mostra o painel interativo de tarefas",
               annotations=LEITURA, structured_output=False)
    def mostrar_painel() -> str:
        # Host sem MCP Apps só vê este texto (degradação elegante).
        return para_json({"total": len(estado.listar())})

    # log_level="WARNING": o default INFO configura o logging raiz e enche a saída com "HTTP Request: ...".
    mcp = MCPServer("app-tarefas", version="1.0.0", extensions=[apps], log_level="WARNING")

    @mcp.tool(description="Lista as tarefas atuais da aplicação (id, titulo, concluida)", annotations=LEITURA,
              structured_output=False)
    def listar_tarefas() -> str:
        return para_json(estado.listar())

    @mcp.tool(description="Adiciona uma tarefa pelo back-end (atalho para preparar cenários de teste)",
              structured_output=False)
    def adicionar_tarefa(titulo: Annotated[str, Field(min_length=1, max_length=80)]) -> str:
        return para_json(estado.adicionar(titulo))

    @mcp.tool(description="Marca a tarefa de id informado como concluída", structured_output=False)
    def concluir_tarefa(id: Annotated[int, Field(gt=0, strict=True)]) -> str:  # noqa: A002 (nome do contrato)
        t = estado.concluir(id)
        if t is None:
            raise ToolError(f"Tarefa {id} não existe")  # vira isError: true para o cliente
        return para_json(t)

    @mcp.tool(description="Apaga todas as tarefas (fixture de teste: deixa a app num estado conhecido)",
              annotations=ToolAnnotations(destructive_hint=True, idempotent_hint=True), structured_output=False)
    def resetar_estado() -> str:
        estado.resetar()
        return para_json({"ok": True})

    if extras:
        extras(mcp, estado)
    return mcp
