""""API REST externa" de cotações (fictícia, local) em FastAPI. Em produção seria um serviço de terceiros."""

import threading
import time

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse

COTACOES = {"USD": 5.42, "EUR": 6.31}
app = FastAPI(title="cotacoes")


@app.get("/cotacao/{moeda}")
def cotacao(moeda: str):
    if moeda not in COTACOES:
        return JSONResponse({"erro": "moeda não encontrada"}, status_code=404)
    return {"moeda": moeda, "brl": COTACOES[moeda], "fonte": "api-local"}


def subir_api(porta: int) -> uvicorn.Server:
    """Sobe o uvicorn numa thread (dentro do próprio script) e espera ficar pronto. Pare com server.should_exit = True."""
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=porta, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    while not server.started:
        time.sleep(0.05)
    return server
