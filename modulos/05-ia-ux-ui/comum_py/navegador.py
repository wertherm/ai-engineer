"""Chrome headless via Playwright para Python usando o Google Chrome JÁ instalado (channel="chrome"):
nada de `playwright install` (que baixaria ~150 MB de browsers)."""

from playwright.async_api import Browser, Playwright, async_playwright


async def abrir_navegador() -> tuple[Playwright, Browser]:
    # Em Python o objeto Playwright (o driver) também precisa ser fechado: devolvemos os dois.
    pw = await async_playwright().start()
    return pw, await pw.chromium.launch(channel="chrome", headless=True)


async def fechar_navegador(pw: Playwright, browser: Browser) -> None:
    await browser.close()
    await pw.stop()
