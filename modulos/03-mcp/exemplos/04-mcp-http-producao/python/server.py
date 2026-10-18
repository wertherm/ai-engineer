"""MCP "de produção" em Python: Streamable HTTP (stateless) + service token (Bearer) + rate limit +
auditoria + proteção de Host/Origin (anti DNS rebinding). Serviço exposto: catálogo de produtos em memória.

Camadas, de fora para dentro:
  Auditoria -> AuthenticationMiddleware (SDK, TokenVerifier) -> RateLimitPorCliente -> AuthContextMiddleware (SDK)
  -> RequireAuthMiddleware (SDK: 401 sem token / 403 sem escopo) -> transport (SDK: Host 421 / Origin 403) -> MCP
"""

import json
import os
import sys
from pathlib import Path
from typing import Annotated, Literal

import uvicorn
from mcp.server import MCPServer
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).parent))  # para importar o seguranca.py vizinho
from seguranca import Auditoria, RateLimitPorCliente, VerificadorDeTokens  # noqa: E402

PORT = int(os.environ.get("PORT", 30370))
LIMITE = int(os.environ.get("RATE_LIMIT", 8))
JANELA_S = int(os.environ.get("RATE_WINDOW_MS", 60_000)) / 1000

PRODUTOS = [
    {"sku": "CAF-001", "nome": "Café especial 500g", "categoria": "mercearia", "preco": 42.9, "estoque": 120},
    {"sku": "CAF-002", "nome": "Café descafeinado 250g", "categoria": "mercearia", "preco": 29.5, "estoque": 0},
    {"sku": "MOE-010", "nome": "Moedor manual", "categoria": "utensilios", "preco": 189.0, "estoque": 7},
]

mcp = MCPServer(
    "catalogo-produtos",
    version="1.0.0",
    token_verifier=VerificadorDeTokens(),
    # Sem authorization server próprio: issuer_url é só informativo; resource_server_url=None desliga o
    # endpoint de metadata OAuth. required_scopes vale para o endpoint /mcp inteiro (403 se faltar).
    auth=AuthSettings(issuer_url=f"http://127.0.0.1:{PORT}", resource_server_url=None, required_scopes=["produtos:ler"]),
)
LEITURA = ToolAnnotations(read_only_hint=True)


@mcp.tool(description="Lista produtos do catálogo, opcionalmente por categoria", annotations=LEITURA,
          structured_output=False)
def listar_produtos(categoria: Literal["mercearia", "utensilios"] | None = None) -> str:
    return json.dumps([p for p in PRODUTOS if not categoria or p["categoria"] == categoria], ensure_ascii=False)


@mcp.tool(description="Consulta estoque e preço de um SKU", annotations=LEITURA, structured_output=False)
def consultar_estoque(sku: Annotated[str, Field(pattern=r"^[A-Z]{3}-\d{3}$")]) -> str:
    p = next((x for x in PRODUTOS if x["sku"] == sku), None)
    if p is None:
        raise ToolError(f"SKU {sku} não encontrado")
    return json.dumps({"sku": sku, "preco": p["preco"], "estoque": p["estoque"]})


# A identidade autenticada chega ao handler por get_access_token() (contextvar preenchida pelo SDK).
@mcp.tool(description="Mostra o cliente autenticado e seus escopos", annotations=LEITURA, structured_output=False)
def quem_sou_eu() -> str:
    tok = get_access_token()
    return json.dumps({"cliente": tok.client_id if tok else None, "escopos": tok.scopes if tok else None})


@mcp.custom_route("/health", methods=["GET"])
async def health(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


def criar_app():
    # Stateless + JSON: cada POST é independente (escala horizontal sem sessão grudada).
    # host="127.0.0.1" => o SDK liga sozinho a validação de Host/Origin.
    app = mcp.streamable_http_app(stateless_http=True, json_response=True, host="127.0.0.1",
                                  max_request_body_size=64 * 1024)
    # O SDK montou [AuthenticationMiddleware, AuthContextMiddleware]; encaixamos as nossas camadas.
    app.user_middleware.insert(1, Middleware(RateLimitPorCliente, limite=LIMITE, janela_s=JANELA_S))
    app.user_middleware.insert(0, Middleware(Auditoria))
    return app


if __name__ == "__main__":
    print(f"[catalogo-produtos] MCP em http://127.0.0.1:{PORT}/mcp (limite {LIMITE}/{JANELA_S:g}s)", file=sys.stderr)
    uvicorn.run(criar_app(), host="127.0.0.1", port=PORT, log_level="warning")
