"""Ponte IA-UI: o MESMO serviço exposto como servidor MCP (SDK oficial `mcp` 2.3.0), para que agentes
(Claude, IDEs, ADK, o agente da entrega 3) e a própria UI Angular usem o Micro-SaaS por um protocolo padrão.

Como no JS (app/src/mcp.js), é UM servidor por requisição, já amarrado ao tenant da API key: as
instruções levam o nome da empresa e nenhuma tool consegue enxergar outro tenant.
"""

import json
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from mcp.server import MCPServer
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from pydantic import Field


def _json(o) -> str:
    # Igual ao JSON.stringify: compacto e sem escapar acentos.
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))


def _arred3(x: float) -> float:
    """Number(x.toFixed(3)) do JS: meio para cima (o round() do Python arredonda empate para o par)."""
    return float(Decimal(repr(x)).quantize(Decimal("0.001"), ROUND_HALF_UP))


def _itens(dados: list) -> CallToolResult:
    """Texto JSON (para LLMs) + structuredContent {itens} (para a UI ler sem parsear texto), como no JS."""
    return CallToolResult(content=[TextContent(type="text", text=_json(dados))], structured_content={"itens": dados})


def criar_servidor_mcp(servico, tenant: dict) -> MCPServer:
    mcp = MCPServer(
        "politicas-com-fonte",
        version="1.0.0",
        instructions=(
            f"Políticas internas da empresa {tenant['nome']}. Use buscar_politicas para trechos (rápido, sem LLM) "
            "e perguntar para uma resposta pronta com citações (lento: usa o LLM)."
        ),
    )

    @mcp.tool(
        title="Listar documentos",
        description="Lista os documentos de política indexados da empresa (arquivo, título, nº de trechos).",
        annotations=ToolAnnotations(read_only_hint=True),
    )
    async def listar_documentos() -> CallToolResult:
        return _itens(await servico.listar_documentos(tenant))

    @mcp.tool(
        title="Buscar nas políticas",
        description="Busca híbrida (semântica + palavra-chave) nas políticas da empresa. Devolve trechos com o arquivo de origem.",
        annotations=ToolAnnotations(read_only_hint=True),
    )
    async def buscar_politicas(
        consulta: Annotated[str, Field(min_length=3, max_length=300, description="assunto ou pergunta")],
        k: Annotated[int, Field(ge=1, le=8, description="quantos trechos")] = 3,
    ) -> CallToolResult:
        trechos = await servico.buscar(tenant, consulta, k=k, canal="mcp")
        return _itens([{"fonte": t["fonte"], "trecho": t["conteudo"], "similaridade": _arred3(t["sim"])} for t in trechos])

    @mcp.tool(
        title="Perguntar às políticas",
        description="Responde uma pergunta sobre as políticas da empresa com citações verificadas [n]. Usa o LLM (pode levar minutos em CPU).",
        annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False),
        structured_output=False,
    )
    async def perguntar(pergunta: Annotated[str, Field(min_length=3, max_length=500)]) -> str:
        r = await servico.perguntar(tenant, pergunta, canal="mcp")
        return _json({"resposta": r["resposta"], "citacoes": [c["fonte"] for c in r["citacoes"]], "verificado": r["verificado"]})

    return mcp
