"""Back-end "proxy de IA" (FastAPI): o navegador NUNCA fala com o provedor do modelo. A chave/endpoint
ficam só aqui (variáveis de ambiente), e o servidor aplica limite de tamanho, rate limit e validação
ANTES de gastar token. O front é o MESMO ../public/index.html do JS (código de browser não se porta).

Uso manual: uv run python exemplos/04-ia-cliente-vs-servidor/python/servidor.py  -> http://127.0.0.1:30560
"""

import json
import math
import os
import sys
import threading
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

sys.path.insert(0, str(Path(__file__).parent))
from busca import Busca  # noqa: E402

from comum_py.config import conversar, criar_cliente  # noqa: E402

PUBLICO = Path(__file__).parent.parent / "public"
LIMITE_CORPO = 4 * 1024  # como express.json({ limit: '4kb' })


class RateLimit:
    """Janela fixa por IP (1 instância; com réplicas, use Redis ou o gateway/WAF)."""

    def __init__(self, limite: int, janela_s: float = 60):
        self.limite, self.janela_s, self.janelas, self.lock = limite, janela_s, {}, threading.Lock()

    def excedeu(self, ip: str) -> JSONResponse | None:
        agora = time.monotonic()
        with self.lock:
            j = self.janelas.get(ip)
            if not j or agora - j["inicio"] >= self.janela_s:
                j = self.janelas[ip] = {"inicio": agora, "n": 0}
            j["n"] += 1
            if j["n"] <= self.limite:
                return None
            espera = math.ceil(j["inicio"] + self.janela_s - agora)
        return JSONResponse({"erro": "Muitas requisições. Tente de novo em instantes."}, 429, {"Retry-After": str(espera)})


async def corpo_json(request: Request) -> dict | JSONResponse:
    bruto = await request.body()
    if len(bruto) > LIMITE_CORPO:
        return JSONResponse({"erro": "Corpo grande demais"}, 413)
    try:
        corpo = json.loads(bruto or b"{}")
    except json.JSONDecodeError:
        return JSONResponse({"erro": "JSON inválido"}, 400)
    return corpo if isinstance(corpo, dict) else {}


def texto_invalido(corpo: dict, campo: str, maximo: int = 300) -> JSONResponse | None:
    v = corpo.get(campo)
    if not isinstance(v, str) or not v.strip() or len(v) > maximo:
        return JSONResponse({"erro": f'"{campo}" deve ter de 1 a {maximo} caracteres'}, 400)
    return None


def criar_servidor(limite_busca: int = 30, limite_chat: int = 5) -> tuple[FastAPI, Busca]:
    cliente = criar_cliente()  # lê OPENAI_BASE_URL / OPENAI_API_KEY do ambiente do SERVIDOR
    busca = Busca(cliente)
    busca.indexar()
    rl_busca, rl_chat = RateLimit(limite_busca), RateLimit(limite_chat)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    # Ordem igual à do Express: rate limit -> corpo -> validação -> IA. O 429 sai sem ler o corpo.
    @app.post("/api/busca")
    async def api_busca(request: Request):
        if erro := rl_busca.excedeu(request.client.host):
            return erro
        corpo = await corpo_json(request)
        if isinstance(corpo, JSONResponse):
            return corpo
        if erro := texto_invalido(corpo, "q"):
            return erro
        interesses = [str(x) for x in corpo.get("interesses", [])[:5]] if isinstance(corpo.get("interesses"), list) else []
        return await run_in_threadpool(busca.buscar, corpo["q"], 3, interesses)

    @app.post("/api/chat")
    async def api_chat(request: Request):
        if erro := rl_chat.excedeu(request.client.host):
            return erro
        corpo = await corpo_json(request)
        if isinstance(corpo, JSONResponse):
            return corpo
        if erro := texto_invalido(corpo, "pergunta"):
            return erro
        trechos = await run_in_threadpool(busca.buscar, corpo["pergunta"], 2)
        contexto = "\n".join(f"- {t['pergunta']} {t['resposta']}" for t in trechos)
        # O prompt de sistema fica no servidor: o usuário não consegue trocá-lo pelo DevTools.
        r = await run_in_threadpool(conversar, cliente, [
            {"role": "system", "content": "Você é o suporte da loja. Responda em 1 ou 2 frases, em português, SÓ com base nos trechos. Se não souber, diga que vai encaminhar a um atendente."},
            {"role": "user", "content": f"Trechos:\n{contexto}\n\nPergunta: {corpo['pergunta']}"},
        ], 120)
        return {"resposta": r.texto.strip(), "fontes": [t["pergunta"] for t in trechos], "segundos": r.segundos}

    app.mount("/", StaticFiles(directory=PUBLICO, html=True))  # estáticos por último
    return app, busca


if __name__ == "__main__":
    import uvicorn

    PORT = int(os.environ.get("PORT", 30560))
    app, _ = criar_servidor()
    print(f"Suporte inteligente em http://127.0.0.1:{PORT}")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
