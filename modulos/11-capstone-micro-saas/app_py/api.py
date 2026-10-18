"""API do Micro-SaaS em FastAPI, com o MESMO contrato da versão Fastify (app/src/api.js): REST versionada
em /v1, documentada em OpenAPI 3.1 (/openapi.json e /docs, gerados pelo FastAPI) e o endpoint MCP (/mcp,
Streamable HTTP stateless) no MESMO processo e com a MESMA autenticação.

Diferenças de framework que foram "desfeitas" para manter o contrato:
- o FastAPI responde 422 em corpo inválido; aqui um handler devolve 400, como o Fastify;
- autenticação, rate limit e Origin rodam num middleware ASGI ANTES de ler o corpo (= onRequest do
  Fastify): sem chave é 401 mesmo com JSON inválido, e o serviço nem é chamado;
- os modelos de resposta filtram campos internos (passos, motivoBloqueio), como o schema de resposta do Fastify.
"""

import json
import logging
import math
import os
import time
from collections.abc import Callable, Sequence
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, FastAPI, Path, Request, Security
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .servidor_mcp import criar_servidor_mcp

log = logging.getLogger("api")

ORIGENS_PADRAO = "http://localhost:31181,http://127.0.0.1:31181,http://localhost:4200"
LIMITE_CORPO = 64 * 1024  # bodyLimit do Fastify
PADRAO_FONTE = r"^[a-z0-9-]{1,60}\.md$"


# ---------- schemas (viram components/schemas no OpenAPI) ----------
class Erro(BaseModel):
    erro: str


class Citacao(BaseModel):
    n: int | None = None
    fonte: str
    trecho: str | None = None


class Resposta(BaseModel):
    resposta: str
    modo: Literal["rag", "agente"]
    citacoes: list[Citacao]
    verificado: bool = Field(description="true = toda citação aponta para um trecho recuperado")
    cache: bool
    tokens: int | None = None
    ms: int


class Trecho(BaseModel):
    fonte: str
    titulo: str
    conteudo: str
    sim: float


class Documento(BaseModel):
    fonte: str
    titulo: str
    chunks: int


class Tenant(BaseModel):
    id: str
    nome: str
    plano: str


class DocumentoIn(BaseModel):
    fonte: str = Field(pattern=PADRAO_FONTE, description="nome do arquivo, ex.: ferias.md")
    texto: str = Field(min_length=20, max_length=20000,
                       description='Markdown: 1ª linha "# Título", parágrafos separados por linha em branco')


class Indexado(BaseModel):
    fonte: str
    chunks: int


class Removido(BaseModel):
    fonte: str
    removidos: int


class BuscaIn(BaseModel):
    consulta: str = Field(min_length=3, max_length=300)
    k: int = Field(default=4, ge=1, le=8)


class PerguntaIn(BaseModel):
    pergunta: str = Field(min_length=3, max_length=500)
    modo: Literal["rag", "agente"] = Field(default="rag", description="agente = várias buscas (perguntas complexas)")


# ---------- rate limit e guarda ASGI ----------
def criar_rate_limit(limite: int, janela_s: float) -> Callable[[str], dict]:
    """Rate limit por tenant (janela fixa, em memória: suficiente para 1 réplica; com N réplicas, Redis/gateway)."""
    janelas: dict[str, list[float]] = {}

    def limitar(chave: str) -> dict:
        t = time.monotonic()
        j = janelas.get(chave)
        if j is None or t - j[0] >= janela_s:
            j = janelas[chave] = [t, 0]
        j[1] += 1
        return {"ok": j[1] <= limite, "restante": max(0, limite - int(j[1])), "retry": math.ceil(j[0] + janela_s - t)}

    return limitar


async def _json(send: Send, status: int, corpo: dict, headers: dict[str, str] | None = None) -> None:
    dados = json.dumps(corpo, ensure_ascii=False, separators=(",", ":")).encode()
    cab = [(b"content-type", b"application/json; charset=utf-8"), (b"content-length", str(len(dados)).encode())]
    cab += [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    await send({"type": "http.response.start", "status": status, "headers": cab})
    await send({"type": "http.response.body", "body": dados})


class Guarda:
    """Middleware ASGI = os hooks onRequest do Fastify. Para /v1/* e /mcp: (Origin, só no /mcp) ->
    API key -> rate limit por tenant -> tenant em scope["state"]. O /mcp é atendido aqui mesmo."""

    def __init__(self, app: ASGIApp, *, autenticar, limitar, origens: Sequence[str], servico):
        self.app, self.autenticar, self.limitar, self.origens, self.servico = app, autenticar, limitar, origens, servico

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        caminho = scope["path"]
        headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
        if int(headers.get("content-length") or 0) > LIMITE_CORPO:
            return await _json(send, 413, {"statusCode": 413, "error": "Payload Too Large", "message": "Request body is too large"})
        e_mcp = caminho == "/mcp"
        if not (e_mcp or caminho.startswith("/v1/")):
            return await self.app(scope, receive, send)

        # Anti DNS rebinding (exigência da spec MCP): Origin, quando presente, precisa estar na allowlist.
        origem = headers.get("origin")
        if e_mcp and origem and origem not in self.origens:
            return await _json(send, 403, {"erro": f"Origin não permitida: {origem}"})

        tipo, _, chave = headers.get("authorization", "").partition(" ")
        tenant = await self.autenticar(chave) if tipo == "Bearer" else None
        if not tenant:
            return await _json(send, 401, {"erro": "API key ausente ou inválida"}, {"WWW-Authenticate": "Bearer"})
        rl = self.limitar(tenant["id"])
        restante = {"RateLimit-Remaining": str(rl["restante"])}
        if not rl["ok"]:
            return await _json(send, 429, {"erro": "limite de requisições excedido"}, {**restante, "Retry-After": str(rl["retry"])})
        scope.setdefault("state", {})["tenant"] = tenant

        async def send_com_header(msg: Message) -> None:
            if msg["type"] == "http.response.start":
                msg["headers"] = [*msg.get("headers", []), (b"ratelimit-remaining", restante["RateLimit-Remaining"].encode())]
            await send(msg)

        if not e_mcp:
            return await self.app(scope, receive, send_com_header)
        if scope["method"] != "POST":
            return await _json(send_com_header, 405, {"erro": "servidor MCP stateless: use POST"}, {"Allow": "POST"})
        # UM servidor MCP por requisição, amarrado ao tenant (como o JS). Stateless + JSON: cada POST é
        # independente. A proteção de Host/Origin do SDK fica desligada: a nossa (acima) usa a allowlist
        # configurável, e atrás do nginx o Host é "api:31100".
        srv = criar_servidor_mcp(self.servico, tenant)
        srv.streamable_http_app(stateless_http=True, json_response=True, max_request_body_size=LIMITE_CORPO,
                                transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False))
        async with srv.session_manager.run():
            await srv.session_manager.asgi_app(scope, receive, send_com_header)


def build_app(
    *,
    servico,
    autenticar,
    rate_limit: tuple[int, float] = (60, 60.0),
    origens: Sequence[str] | None = None,
    ganchos: Sequence[Callable[[APIRouter], None]] = (),  # recebem o router /v1 (exercício 01: cota diária)
    lifespan=None,
) -> FastAPI:
    if origens is None:
        origens = os.environ.get("ORIGENS_PERMITIDAS", ORIGENS_PADRAO).split(",")

    @asynccontextmanager
    async def _lifespan(app: FastAPI):
        if lifespan is None:
            yield
        else:
            async with lifespan(app):
                yield

    app = FastAPI(
        title="Políticas com Fonte · API",
        version="1.0.0",
        description="Micro-SaaS que responde dúvidas sobre as políticas internas de pequenas empresas, com citações "
                    "verificadas. Multi-tenant por API key.",
        openapi_tags=[{"name": "politicas"}, {"name": "operacao"}],
        lifespan=_lifespan,
    )
    app.add_middleware(Guarda, autenticar=autenticar, limitar=criar_rate_limit(*rate_limit), origens=list(origens),
                       servico=servico)

    # ---- erros no formato do Fastify ----
    @app.exception_handler(RequestValidationError)
    async def _validacao(_req: Request, exc: RequestValidationError) -> JSONResponse:
        e = exc.errors()[0]
        local = "/".join(str(p) for p in e["loc"])
        return JSONResponse({"statusCode": 400, "error": "Bad Request", "message": f"{local} {e['msg']}"}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_req: Request, exc: StarletteHTTPException) -> JSONResponse:
        from http import HTTPStatus

        # detail dict (ex.: {"erro": ...} do gancho de cota) vira o corpo; texto vira o formato do Fastify.
        corpo = exc.detail if isinstance(exc.detail, dict) else {
            "statusCode": exc.status_code, "error": HTTPStatus(exc.status_code).phrase, "message": str(exc.detail)}
        return JSONResponse(corpo, status_code=exc.status_code, headers=exc.headers)

    @app.get("/health", tags=["operacao"])
    async def health() -> dict:
        return {"status": "ok"}

    # Só documenta o esquema "apiKey" (Bearer) no OpenAPI; quem barra de verdade é a Guarda.
    bearer = HTTPBearer(scheme_name="apiKey", description="API key do cliente (tenant)", auto_error=False)
    v1 = APIRouter(prefix="/v1", tags=["politicas"], dependencies=[Security(bearer)])

    def tenant_atual(request: Request) -> dict:
        return request.state.tenant

    TenantDep = Annotated[dict, Depends(tenant_atual)]
    for gancho in ganchos:
        gancho(v1)

    @v1.get("/me", summary="Tenant autenticado", response_model=Tenant)
    async def me(tenant: TenantDep):
        return {"id": tenant["id"], "nome": tenant["nome"], "plano": tenant["plano"]}

    @v1.get("/documentos", summary="Lista os documentos indexados", response_model=list[Documento])
    async def listar(tenant: TenantDep):
        return await servico.listar_documentos(tenant)

    @v1.post("/documentos", summary="Envia (ou substitui) um documento de política em Markdown", status_code=201,
             response_model=Indexado, responses={400: {"model": Erro}})
    async def enviar(doc: DocumentoIn, tenant: TenantDep):
        return await servico.indexar(tenant, doc.model_dump())

    @v1.delete("/documentos/{fonte}", summary="Remove um documento (e invalida o cache do tenant)", response_model=Removido,
               responses={404: {"model": Erro}})
    async def remover(tenant: TenantDep, fonte: Annotated[str, Path(pattern=PADRAO_FONTE)]):
        r = await servico.remover(tenant, fonte)
        return r if r["removidos"] else JSONResponse({"erro": "documento não encontrado"}, status_code=404)

    @v1.post("/busca", summary="Busca híbrida de trechos (sem LLM)", response_model=list[Trecho])
    async def buscar(corpo: BuscaIn, tenant: TenantDep):
        return await servico.buscar(tenant, corpo.consulta, k=corpo.k, canal="rest")

    @v1.post("/perguntas", summary="Responde uma pergunta com citações verificadas", response_model=Resposta,
             response_model_exclude_none=True, responses={502: {"model": Erro}})
    async def perguntar(corpo: PerguntaIn, tenant: TenantDep):
        try:
            return await servico.perguntar(tenant, corpo.pergunta, modo=corpo.modo, canal="rest")
        except Exception as err:
            # Falha do provedor de IA não é erro do cliente: 502 diz "a dependência falhou, tente depois".
            log.error(json.dumps({"msg": "falha no LLM", "err": str(err)[:120]}, ensure_ascii=False))
            return JSONResponse({"erro": "provedor de IA indisponível"}, status_code=502)

    app.include_router(v1)
    return app
