"""Solução do exercício 2 (Python): escopos por tool + rate limit por token (token bucket com cota por plano).

Diferença de desenho em relação ao JS: lá o servidor é criado por requisição e só REGISTRA as tools do
escopo. Aqui há um MCPServer só, e um ServerMiddleware (SDK 2.x) filtra o tools/list e barra o tools/call
conforme os escopos do token (get_access_token()). O handler confere de novo (defesa em profundidade).
"""

import hashlib
import json
import math
import os
import sys
import time
from typing import Annotated

import uvicorn
from mcp.server import MCPServer
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from pydantic import Field
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse

PORT = int(os.environ.get("PORT", 30380))


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


# Cota por plano: capacidade do balde e recarga (fichas por segundo).
PLANOS = {"free": {"capacidade": 3, "recarga_por_seg": 0.05}, "pro": {"capacidade": 20, "recarga_por_seg": 1.0}}
EXPIRA = int(time.time()) + 3600
TOKENS = {
    sha256("tok-leitor"): {"client_id": "dashboard", "plano": "free", "scopes": ["catalogo:ler"]},
    sha256("tok-editor"): {"client_id": "backoffice", "plano": "pro", "scopes": ["catalogo:ler", "catalogo:escrever"]},
}


class Verificador:
    async def verify_token(self, token: str) -> AccessToken | None:
        r = TOKENS.get(sha256(token))
        if r is None:
            return None
        # "claims" leva dados próprios (aqui, o plano) até os middlewares e handlers.
        return AccessToken(token=token, client_id=r["client_id"], scopes=r["scopes"], expires_at=EXPIRA,
                           claims={"plano": r["plano"]})


class TokenBucket:
    """Token bucket por client_id: permite rajadas curtas (capacidade) e limita a média (recarga)."""

    def __init__(self, app) -> None:
        self.app = app
        self.baldes: dict[str, dict[str, float]] = {}

    async def __call__(self, scope, receive, send) -> None:
        user = scope.get("user")
        if scope["type"] != "http" or not isinstance(user, AuthenticatedUser):
            return await self.app(scope, receive, send)  # sem token: o SDK responde 401 logo adiante
        tok = user.access_token
        plano = tok.claims["plano"]
        cap, recarga = PLANOS[plano]["capacidade"], PLANOS[plano]["recarga_por_seg"]
        agora = time.monotonic()
        b = self.baldes.setdefault(tok.client_id, {"fichas": cap, "ultimo": agora})
        b["fichas"] = min(cap, b["fichas"] + (agora - b["ultimo"]) * recarga)
        b["ultimo"] = agora
        if b["fichas"] < 1:
            retry = math.ceil((1 - b["fichas"]) / recarga)
            resp = JSONResponse({"jsonrpc": "2.0", "id": None,
                                 "error": {"code": -32000, "message": f"Cota do plano {plano} esgotada"}},
                                status_code=429, headers={"Retry-After": str(retry)})
            return await resp(scope, receive, send)
        b["fichas"] -= 1
        await self.app(scope, receive, send)


precos = {"CAF-001": 42.9, "MOE-010": 189.0}

# Tool -> escopo exigido. Fonte única da verdade para filtrar o tools/list E checar no handler.
ESCOPO_DA_TOOL = {"consultar_preco": "catalogo:ler", "ajustar_preco": "catalogo:escrever"}


def pode(tool: str) -> bool:
    tok = get_access_token()
    return tok is not None and ESCOPO_DA_TOOL.get(tool) in tok.scopes


async def escopos_por_tool(ctx, call_next):
    """ServerMiddleware: o modelo nem fica sabendo que a tool existe, e chamá-la "às cegas" não adianta."""
    if ctx.method == "tools/call":
        nome = (ctx.params or {}).get("name")
        if not pode(nome):
            # Mesma resposta de uma tool que não existe: não vaza a lista de tools de outros escopos.
            # Devolva o MODELO (não um dict montado à mão): o SDK serializa conforme a versão negociada
            # (na 2026-07-28 o resultado leva "resultType"; um dict sem ele quebra o client Python 2.x).
            return CallToolResult(content=[TextContent(type="text", text=f"Unknown tool: {nome}")], is_error=True)
    resultado = await call_next(ctx)
    if ctx.method == "tools/list" and isinstance(resultado, dict):
        resultado = {**resultado, "tools": [t for t in resultado["tools"] if pode(t["name"])]}
    return resultado


mcp = MCPServer(
    "catalogo-escopos", version="1.0.0", token_verifier=Verificador(), middleware=[escopos_por_tool],
    # Sem required_scopes: basta estar autenticado; a autorização fina é por tool.
    auth=AuthSettings(issuer_url=f"http://127.0.0.1:{PORT}", resource_server_url=None),
)


@mcp.tool(description="Preço de um SKU", annotations=ToolAnnotations(read_only_hint=True), structured_output=False)
def consultar_preco(sku: str) -> str:
    if not pode("consultar_preco"):  # defesa em profundidade
        raise ToolError("Escopo catalogo:ler necessário")
    return json.dumps({"sku": sku, "preco": precos.get(sku)})


@mcp.tool(description="Ajusta o preço de um SKU (máx. 20% por vez)",
          annotations=ToolAnnotations(read_only_hint=False, destructive_hint=True), structured_output=False)
def ajustar_preco(sku: str, novo_preco: Annotated[float, Field(gt=0)]) -> str:
    if not pode("ajustar_preco"):
        raise ToolError("Escopo catalogo:escrever necessário")
    atual = precos.get(sku)
    if atual is None:
        raise ToolError(f"SKU {sku} não existe")
    # Regra de negócio no servidor: o LLM não pode dar um desconto de 90% "por engano".
    if abs(novo_preco - atual) / atual > 0.2:
        raise ToolError("Variação acima de 20% exige aprovação humana")
    precos[sku] = novo_preco
    print(json.dumps({"auditoria": "ajuste_preco", "cliente": get_access_token().client_id, "sku": sku,
                      "de": atual, "para": novo_preco}, ensure_ascii=False), flush=True)
    return json.dumps({"sku": sku, "preco": novo_preco})


@mcp.custom_route("/health", methods=["GET"])
async def health(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


if __name__ == "__main__":
    app = mcp.streamable_http_app(stateless_http=True, json_response=True, host="127.0.0.1")
    app.user_middleware.insert(1, Middleware(TokenBucket))  # depois do AuthenticationMiddleware do SDK
    print(f"[catalogo-escopos] http://127.0.0.1:{PORT}/mcp", file=sys.stderr)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
