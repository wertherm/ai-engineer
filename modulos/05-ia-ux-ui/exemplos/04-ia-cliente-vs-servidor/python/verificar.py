"""Verificação ponta a ponta do exemplo 04 no Chrome headless (versão Python de verificar.js):
1) busca semântica e personalização, 2) chatbot de suporte, 3) a chave NUNCA chega ao browser,
4) validação de entrada e rate limit acontecem ANTES de gastar token.

Uso (da pasta do módulo): uv run python exemplos/04-ia-cliente-vs-servidor/python/verificar.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

# Ollama aceita qualquer chave: uma "chave sentinela" prova que ela não vaza. Precisa vir ANTES de
# importar comum_py.config (que lê o ambiente na importação).
os.environ.setdefault("OPENAI_API_KEY", "sk-sentinela-nao-deve-vazar-123")
SEGREDO = os.environ["OPENAI_API_KEY"]

import httpx2  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from servidor import criar_servidor  # noqa: E402

from comum_py.config import BASE_URL  # noqa: E402
from comum_py.navegador import abrir_navegador, fechar_navegador  # noqa: E402
from comum_py.servidor import servidor_em_thread  # noqa: E402

PORT = int(os.environ.get("PORT", 30561))


def origem(url: str) -> str:
    u = urlsplit(url)
    return f"{u.scheme}://{u.netloc}"


async def verificar(base: str) -> bool:
    pw, browser = await abrir_navegador()
    page = await browser.new_page()
    # Espiona TUDO que o navegador pede e recebe.
    urls: list[str] = []
    leituras: list[asyncio.Task] = []
    page.on("request", lambda r: urls.append(r.url))
    page.on("response", lambda r: leituras.append(asyncio.create_task(r.text())))
    await page.goto(base)

    # 1) Busca semântica: a pergunta não tem as mesmas palavras da FAQ ("chega" x "prazo de entrega").
    await page.get_by_label("Buscar na ajuda").fill("em quantos dias meu café chega?")
    await page.get_by_role("button", name="Buscar").click()
    await page.locator("article").first.wait_for()
    top = await page.locator("article h2").all_text_contents()
    print(f'Busca "em quantos dias meu café chega?" -> {json.dumps(top, ensure_ascii=False)}')

    # Personalização: clicar num resultado de assinatura e repetir uma busca ambígua.
    await page.get_by_label("Buscar na ajuda").fill("quero cancelar")
    await page.get_by_role("button", name="Buscar").click()
    await page.wait_for_function("() => document.querySelector('article small')?.textContent.includes('score')")
    antes = await page.locator("article small").all_text_contents()
    await page.locator("article[data-categoria=assinatura]").first.click()
    await page.get_by_role("button", name="Buscar").click()
    await page.wait_for_timeout(1500)
    depois = await page.locator("article small").all_text_contents()
    interesses = await page.evaluate("() => localStorage.getItem('interesses')")
    print(f'Personalização "quero cancelar": antes {json.dumps(antes, ensure_ascii=False)}\n'
          f"                                depois {json.dumps(depois, ensure_ascii=False)} (interesses={interesses})")

    # 2) Chatbot de suporte (RAG no servidor).
    await page.get_by_label("Pergunte ao assistente").fill("Posso pagar com Pix? Tem desconto?")
    await page.get_by_role("button", name="Perguntar").click()
    await page.wait_for_function("() => !['', 'Pensando...'].includes(document.getElementById('resposta').textContent)",
                                 timeout=900_000)
    print(f"Chatbot: {await page.locator('#resposta').text_content()}")

    # 3) A chave e o endpoint do modelo nunca aparecem do lado do navegador.
    corpos = [c for c in await asyncio.gather(*leituras, return_exceptions=True) if isinstance(c, str)]
    origem_modelo = origem(BASE_URL)
    vazou_url = any(u.startswith(origem_modelo) for u in urls)
    vazou_chave = any(SEGREDO in c for c in corpos) or SEGREDO in await page.content()
    print(f"Requisições do browser: {len(urls)}, todas para {base}? {all(u.startswith(base) for u in urls)}")
    print(f"Browser chamou {origem_modelo}? {vazou_url} | chave apareceu em alguma resposta? {vazou_chave}")
    await fechar_navegador(pw, browser)

    # 4) Proteções que não gastam token: validação e rate limit.
    async with httpx2.AsyncClient(base_url=base) as http:
        tamanho = await http.post("/api/chat", json={"pergunta": "x" * 301})
        print(f"Pergunta com 301 caracteres -> HTTP {tamanho.status_code}")
        # Rajada de 7 buscas inválidas (q vazio): o rate limit roda ANTES da validação e do embedding.
        status = [(await http.post("/api/busca", json={"q": ""})).status_code for _ in range(7)]
    print(f"Rajada de 7 buscas inválidas (limite 6/min) -> {', '.join(map(str, status))}")
    return not vazou_url and not vazou_chave and tamanho.status_code == 400 and 429 in status


def main() -> int:
    app, busca = criar_servidor(limite_busca=6, limite_chat=3)
    try:
        with servidor_em_thread(app, PORT) as base:
            ok = asyncio.run(verificar(base))
    finally:
        busca.conn.close()
    print("Verificação OK" if ok else "Verificação FALHOU")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
