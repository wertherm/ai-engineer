"""E2E determinístico (sem LLM), versão pytest: a UI é dirigida pelo Playwright e o estado é preparado e
conferido pelo MCP da própria aplicação. É a versão "roteirizada" do que o agente faz.
Uso: uv run pytest exemplos/03-app-com-mcp-e2e/python   (porta 30551)"""

import os
import sys
from pathlib import Path

import httpx2
import pytest

sys.path.insert(0, str(Path(__file__).parent))
from app import criar_app  # noqa: E402
from cliente_mcp import chamar, conectar_mcp, renderizar_recurso_ui  # noqa: E402
from estado import Estado  # noqa: E402

from comum_py.navegador import abrir_navegador, fechar_navegador  # noqa: E402
from comum_py.servidor import servidor_em_thread  # noqa: E402

pytestmark = pytest.mark.anyio
PORT = int(os.environ.get("PORT", 30551))


@pytest.fixture(scope="module")
def base():
    with servidor_em_thread(criar_app(Estado()), PORT) as url:
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


async def test_mcp_exige_token(base):
    async with httpx2.AsyncClient() as http:
        r = await http.post(f"{base}/mcp", content="{}", headers={"content-type": "application/json",
                                                                   "accept": "application/json, text/event-stream"})
    assert r.status_code == 401


async def test_adicionar_e_concluir_pela_ui_conferindo_pelo_mcp(base, browser, mcp):
    await chamar(mcp, "resetar_estado")
    page = await browser.new_page()
    await page.goto(base)
    await page.get_by_label("Nova tarefa").fill("Comprar café")
    await page.get_by_role("button", name="Adicionar").click()
    await page.get_by_role("status").filter(has_text="adicionada").wait_for()
    assert await chamar(mcp, "listar_tarefas") == [{"id": 1, "titulo": "Comprar café", "concluida": False}]

    await page.get_by_label("Comprar café").check()
    await page.get_by_role("status").filter(has_text="concluída").wait_for()
    assert (await chamar(mcp, "listar_tarefas"))[0]["concluida"] is True
    await page.close()


async def test_recurso_de_ui_mcp_apps_e_anunciado_e_age_via_tools_call(browser, mcp):
    await chamar(mcp, "resetar_estado")
    await chamar(mcp, "adicionar_tarefa", {"titulo": "Revisar PR"})
    tools = (await mcp.list_tools()).tools
    painel = next(t for t in tools if t.name == "mostrar_painel")
    assert painel.meta["ui"]["resourceUri"] == "ui://tarefas/painel"

    page = await browser.new_page()
    recurso, chamadas, frame = await renderizar_recurso_ui(page, mcp, "ui://tarefas/painel")
    assert recurso.mime_type == "text/html;profile=mcp-app"
    await frame.get_by_role("button", name="Concluir Revisar PR").click()
    # o clique dispara um postMessage assíncrono: espera a chamada chegar ao MCP (até 2 s)
    for _ in range(20):
        if chamadas:
            break
        await page.wait_for_timeout(100)
    assert chamadas == ["concluir_tarefa"]
    assert (await chamar(mcp, "listar_tarefas"))[0]["concluida"] is True
    await page.close()
