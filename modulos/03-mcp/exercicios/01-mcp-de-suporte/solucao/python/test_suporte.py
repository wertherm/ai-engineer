"""Testes em processo: Client(servidor) conecta direto no MCPServer, sem stdio nem HTTP.

Rápidos e determinísticos, mas passam pelo protocolo MCP de verdade (JSON-RPC, validação pydantic).
É o equivalente Python do InMemoryTransport do SDK JS.
"""

import json
import sys
from pathlib import Path

import pytest
from mcp import Client

sys.path.insert(0, str(Path(__file__).parent))
from suporte import criar_servidor_suporte  # noqa: E402

pytestmark = pytest.mark.anyio  # plugin do anyio (vem com o mcp): roda os testes async


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    # Servidor novo em cada teste: estado isolado.
    async with Client(criar_servidor_suporte()) as c:
        yield c


async def test_expoe_as_3_tools_com_schema_e_annotations(client):
    tools = {t.name: t for t in (await client.list_tools()).tools}
    assert sorted(tools) == ["abrir_ticket", "fechar_ticket", "listar_tickets"]
    assert tools["abrir_ticket"].input_schema["properties"]["prioridade"]["enum"] == ["baixa", "media", "alta"]
    assert tools["listar_tickets"].annotations.read_only_hint is True
    assert tools["fechar_ticket"].output_schema is not None


async def test_abre_ticket_com_prioridade_padrao_e_lista_por_status(client):
    r = await client.call_tool("abrir_ticket", {"cliente": "Oficina Turbo", "assunto": "Boleto não chegou"})
    assert not r.is_error
    assert r.structured_content["ticket"]["prioridade"] == "media"
    abertos = await client.call_tool("listar_tickets", {"status": "aberto"})
    assert len(abertos.structured_content["tickets"]) == 1


async def test_fecha_ticket_e_nao_deixa_fechar_de_novo(client):
    r = await client.call_tool("abrir_ticket", {"cliente": "Padaria", "assunto": "Erro no login", "prioridade": "alta"})
    id_ = r.structured_content["ticket"]["id"]
    fechado = await client.call_tool("fechar_ticket", {"id": id_, "resolucao": "Senha resetada"})
    assert fechado.structured_content["ticket"]["status"] == "fechado"
    de_novo = await client.call_tool("fechar_ticket", {"id": id_, "resolucao": "Senha resetada"})
    assert de_novo.is_error
    assert "já está fechado" in de_novo.content[0].text


async def test_ticket_inexistente_e_argumentos_invalidos_viram_is_error(client):
    assert (await client.call_tool("fechar_ticket", {"id": 42, "resolucao": "qualquer"})).is_error
    invalido = await client.call_tool("abrir_ticket", {"cliente": "X", "assunto": "oi", "prioridade": "urgente"})
    assert invalido.is_error
    assert "validation error" in invalido.content[0].text


async def test_resource_suporte_tickets_id_devolve_o_ticket(client):
    await client.call_tool("abrir_ticket", {"cliente": "Clínica Sorriso", "assunto": "Nota fiscal errada"})
    r = await client.read_resource("suporte://tickets/1")
    assert json.loads(r.contents[0].text)["cliente"] == "Clínica Sorriso"
