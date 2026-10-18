"""Solução do exercício 02 (pytest): E2E que cria e conclui tarefas PELA UI e confere com a tool nova
buscar_tarefas PELO MCP. Uso: uv run pytest exercicios/02-tool-mcp-e-teste-e2e   (porta 30570)"""

import os
import sys
from pathlib import Path

import pytest

MODULO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(MODULO / "exemplos" / "03-app-com-mcp-e2e" / "python"))
sys.path.insert(0, str(Path(__file__).parent))
from app import criar_app  # noqa: E402
from cliente_mcp import chamar, conectar_mcp  # noqa: E402
from estado import Estado  # noqa: E402
from tool_buscar import registrar_buscar_tarefas  # noqa: E402

from comum_py.navegador import abrir_navegador, fechar_navegador  # noqa: E402
from comum_py.servidor import servidor_em_thread  # noqa: E402

pytestmark = pytest.mark.anyio
PORT = int(os.environ.get("PORT", 30570))


@pytest.fixture(scope="module")
def base():
    with servidor_em_thread(criar_app(Estado(), extras_mcp=registrar_buscar_tarefas), PORT) as url:
        yield url


@pytest.fixture(scope="module")
async def browser():
    pw, b = await abrir_navegador()
    yield b
    await fechar_navegador(pw, b)


@pytest.fixture
async def mcp(base):
    async with conectar_mcp(base) as client:
        yield client


async def test_a_tool_nova_aparece_no_tools_list_com_schema_e_e_somente_leitura(mcp):
    tools = (await mcp.list_tools()).tools
    t = next((x for x in tools if x.name == "buscar_tarefas"), None)
    assert t, "buscar_tarefas deveria estar registrada"
    assert sorted(t.input_schema["properties"]) == ["concluida", "texto"]
    assert t.annotations.read_only_hint is True


async def test_ui_cria_e_conclui_mcp_filtra_por_texto_e_status(base, browser, mcp):
    await chamar(mcp, "resetar_estado")
    page = await browser.new_page()
    await page.goto(base)
    for titulo in ("Comprar café", "Lavar a louça", "Café com o time"):
        await page.get_by_label("Nova tarefa").fill(titulo)
        await page.get_by_role("button", name="Adicionar").click()
        await page.get_by_label(titulo, exact=True).wait_for()  # espera a lista redesenhar
    await page.get_by_label("Comprar café", exact=True).check()
    await page.get_by_role("status").filter(has_text="concluída").wait_for()

    com_cafe = await chamar(mcp, "buscar_tarefas", {"texto": "cafe"})
    assert [t["titulo"] for t in com_cafe] == ["Comprar café", "Café com o time"]
    pendentes = await chamar(mcp, "buscar_tarefas", {"concluida": False})
    assert [t["titulo"] for t in pendentes] == ["Lavar a louça", "Café com o time"]
    cafe_pendente = await chamar(mcp, "buscar_tarefas", {"texto": "CAFÉ", "concluida": False})
    assert [t["id"] for t in cafe_pendente] == [3]
    await page.close()


async def test_entrada_invalida_e_recusada_pelo_schema_sem_tocar_no_estado(mcp):
    r = await mcp.call_tool("buscar_tarefas", {"concluida": "sim"})
    assert r.is_error is True
