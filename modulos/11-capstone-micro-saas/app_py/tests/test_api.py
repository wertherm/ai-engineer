"""Contrato da API e do MCP com dublês (sem banco, sem LLM) — versão pytest de app/test/api.test.js.
É o que o CI executa. O TestClient simula HTTP sem abrir porta (= app.inject() do Fastify); o MCP é
testado com o client oficial do SDK contra um uvicorn de verdade numa thread (porta 31160)."""

import asyncio
import threading
import time
from unittest.mock import AsyncMock

import httpx2
import pytest
import uvicorn
from fastapi.testclient import TestClient
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from app_py.api import build_app

TENANTS = {"k-acme": {"id": "acme", "nome": "Acme", "plano": "pro"}, "k-pad": {"id": "padaria", "nome": "Padaria", "plano": "free"}}
PORTA_MCP = 31160
URL_MCP = f"http://127.0.0.1:{PORTA_MCP}/mcp"


async def autenticar(k):
    return TENANTS.get(k)


def auth(k="k-acme"):
    return {"authorization": f"Bearer {k}"}


def servico_falso():
    s = AsyncMock()
    s.listar_documentos.side_effect = lambda t: [{"fonte": f"{t['id']}.md", "titulo": "T", "chunks": 1}]
    s.indexar.side_effect = lambda _t, d: {"fonte": d["fonte"], "chunks": 2}
    s.buscar.side_effect = lambda t, q, **_: [{"fonte": f"{t['id']}.md", "titulo": "T", "conteudo": f"trecho sobre {q}", "sim": 0.8, "rrf": 0.03}]
    s.perguntar.return_value = {"resposta": "São 30 dias [1].", "modo": "rag", "citacoes": [{"n": 1, "fonte": "ferias.md", "trecho": "x"}],
                                "verificado": True, "cache": False, "tokens": 10, "ms": 5, "motivoBloqueio": None, "passos": 9}
    return s


def cliente(servico=None, **kw):
    return TestClient(build_app(servico=servico or servico_falso(), autenticar=autenticar, **kw))


def test_401_sem_api_key_e_o_servico_nem_e_chamado():
    s = servico_falso()
    r = cliente(s).get("/v1/documentos")
    assert r.status_code == 401
    assert r.json() == {"erro": "API key ausente ou inválida"}
    assert r.headers["www-authenticate"] == "Bearer"
    s.listar_documentos.assert_not_called()


def test_o_tenant_vem_da_api_key_isolamento():
    c = cliente()
    assert c.get("/v1/documentos", headers=auth("k-acme")).json()[0]["fonte"] == "acme.md"
    assert c.get("/v1/documentos", headers=auth("k-pad")).json()[0]["fonte"] == "padaria.md"


def test_400_na_validacao_antes_de_gastar_tokens():
    s = servico_falso()
    c = cliente(s)
    r = c.post("/v1/perguntas", headers=auth(), json={"pergunta": "x"})
    assert r.status_code == 400  # o FastAPI daria 422; o handler devolve 400 como o Fastify
    s.perguntar.assert_not_called()
    d = c.post("/v1/documentos", headers=auth(), json={"fonte": "../etc/passwd", "texto": "x" * 30})
    assert d.status_code == 400
    assert c.delete("/v1/documentos/..%2Fetc.md", headers=auth()).status_code in (400, 404)


def test_200_com_citacoes_e_modo_padrao_rag():
    s = servico_falso()
    r = cliente(s).post("/v1/perguntas", headers=auth(), json={"pergunta": "Quantos dias de férias?"})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["verificado"] is True and corpo["citacoes"] == [{"n": 1, "fonte": "ferias.md", "trecho": "x"}]
    assert "passos" not in corpo and "motivoBloqueio" not in corpo  # o schema de resposta filtra campos internos
    s.perguntar.assert_called_once_with(TENANTS["k-acme"], "Quantos dias de férias?", modo="rag", canal="rest")


def test_502_quando_o_provedor_de_ia_falha():
    s = servico_falso()
    s.perguntar.side_effect = ConnectionRefusedError("ECONNREFUSED")
    r = cliente(s).post("/v1/perguntas", headers=auth(), json={"pergunta": "Quantos dias?"})
    assert (r.status_code, r.json()) == (502, {"erro": "provedor de IA indisponível"})


def test_404_documento_inexistente_e_201_ao_enviar():
    s = servico_falso()
    s.remover.return_value = {"fonte": "nao-existe.md", "removidos": 0}
    c = cliente(s)
    assert c.delete("/v1/documentos/nao-existe.md", headers=auth()).json() == {"erro": "documento não encontrado"}
    r = c.post("/v1/documentos", headers=auth(), json={"fonte": "vale.md", "texto": "# Vale\n\nRegra com mais de vinte letras."})
    assert (r.status_code, r.json()) == (201, {"fonte": "vale.md", "chunks": 2})


def test_429_ao_estourar_o_rate_limit_do_tenant_o_outro_segue_livre():
    c = cliente(rate_limit=(2, 60.0))
    codigos = [c.get("/v1/me", headers=auth()).status_code for _ in range(3)]
    assert codigos == [200, 200, 429]
    assert c.get("/v1/me", headers=auth("k-pad")).status_code == 200


def test_publica_o_contrato_openapi_31_com_seguranca_bearer():
    spec = cliente().get("/openapi.json").json()
    assert spec["openapi"].startswith("3.1")
    assert {"/v1/perguntas", "/v1/busca", "/v1/documentos"} <= set(spec["paths"])
    assert spec["components"]["securitySchemes"]["apiKey"]["scheme"] == "bearer"
    assert "/mcp" not in spec["paths"]


# ---------------- MCP com o client oficial ----------------
@pytest.fixture(scope="module")
def servidor_mcp():
    s = servico_falso()
    srv = uvicorn.Server(uvicorn.Config(build_app(servico=s, autenticar=autenticar), host="127.0.0.1", port=PORTA_MCP,
                                        log_level="warning"))
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    while not srv.started:
        time.sleep(0.05)
    yield s
    srv.should_exit = True
    th.join(timeout=10)


async def _com_client(chave, fn):
    async with httpx2.AsyncClient(headers=auth(chave)) as http, Client(streamable_http_client(URL_MCP, http_client=http)) as c:
        return await fn(c)


def test_mcp_lista_3_tools_e_busca_no_tenant_da_chave(servidor_mcp):
    async def cenario(c):
        tools = (await c.list_tools()).tools
        r = await c.call_tool("buscar_politicas", {"consulta": "turno", "k": 1})
        return sorted(t.name for t in tools), r

    nomes, r = asyncio.run(_com_client("k-pad", cenario))
    assert nomes == ["buscar_politicas", "listar_documentos", "perguntar"]
    assert r.structured_content["itens"][0]["fonte"] == "padaria.md"
    servidor_mcp.buscar.assert_called_with(TENANTS["k-pad"], "turno", k=1, canal="mcp")


def test_mcp_rejeita_chave_invalida_e_origin_fora_da_allowlist(servidor_mcp):
    with pytest.raises(Exception):  # noqa: B017 - o SDK embrulha o 401 em exceções diferentes por versão
        asyncio.run(_com_client("k-errada", lambda c: c.list_tools()))
    r = httpx2.post(URL_MCP, headers={**auth(), "origin": "http://evil.example", "content-type": "application/json"}, content="{}")
    assert r.status_code == 403
    assert httpx2.get(URL_MCP, headers=auth()).status_code == 405
