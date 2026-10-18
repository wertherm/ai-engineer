"""Mock em memória de um subconjunto da API REST do Trello (mesmos caminhos e parâmetros de /1/...), em FastAPI.

Serve para testar o bot sem conta: trocar TRELLO_BASE_URL para https://api.trello.com/1 usa o real.
Uso (da pasta do módulo): uv run python exemplos/05-bot-cards-aprovacao/python/mock_trello.py   (porta 30750)
"""
import itertools
import os

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

PORTA = int(os.environ.get("PORTA_MOCK", "30750"))
_seq = itertools.count(101)

db = {
    "lists": [
        {"id": "l1", "idBoard": "b1", "name": "Backlog"},
        {"id": "l2", "idBoard": "b1", "name": "Fazendo"},
        {"id": "l3", "idBoard": "b1", "name": "Feito"},
    ],
    "labels": [
        {"id": "lbA", "idBoard": "b1", "name": "alta", "color": "red"},
        {"id": "lbM", "idBoard": "b1", "name": "media", "color": "yellow"},
        {"id": "lbB", "idBoard": "b1", "name": "baixa", "color": "green"},
    ],
    "cards": [
        {"id": "c1", "idBoard": "b1", "idList": "l1", "name": "Segunda via no portal", "idLabels": ["lbM"], "due": "2026-11-04T18:00:00.000Z", "idMembers": ["ana"], "closed": False},
        {"id": "c2", "idBoard": "b1", "idList": "l2", "name": "Regra dos 60 dias", "idLabels": ["lbA"], "due": "2026-11-03T18:00:00.000Z", "idMembers": [], "closed": False},
        {"id": "c3", "idBoard": "b1", "idList": "l1", "name": "Tema escuro no portal", "idLabels": ["lbB"], "due": None, "idMembers": [], "closed": False},
        {"id": "c4", "idBoard": "b1", "idList": "l2", "name": "Subir homologação", "idLabels": ["lbA"], "due": "2026-11-04T12:00:00.000Z", "idMembers": [], "closed": False},
        {"id": "c5", "idBoard": "b1", "idList": "l1", "name": "Texto do e-mail no jurídico", "idLabels": ["lbM"], "due": "2026-11-01T12:00:00.000Z", "idMembers": ["marina"], "closed": False},
    ],
}

app = FastAPI(title="mock Trello")


@app.middleware("http")
async def exigir_key_token(request: Request, call_next):
    # Como no Trello: key e token na query. O mock só exige que existam.
    if not (request.query_params.get("key") and request.query_params.get("token")):
        return PlainTextResponse("invalid key", status_code=401)
    return await call_next(request)


@app.get("/1/boards/{board}/lists")
def listas(board: str):
    return [l for l in db["lists"] if l["idBoard"] == board]


@app.get("/1/boards/{board}/labels")
def etiquetas(board: str):
    return [l for l in db["labels"] if l["idBoard"] == board]


@app.get("/1/boards/{board}/cards")
def cards(board: str):
    return [c for c in db["cards"] if c["idBoard"] == board and not c["closed"]]


async def _params(request: Request) -> dict:
    """Parâmetros podem vir na query ou no corpo JSON (o Trello aceita os dois)."""
    corpo = await request.json() if await request.body() else {}
    return {**request.query_params, **corpo}


def _lista_de(v) -> list:
    return v if isinstance(v, list) else [v]  # o [].concat(x) do JS


@app.post("/1/cards")
async def criar_card(request: Request):
    p = await _params(request)
    lista = next((l for l in db["lists"] if l["id"] == p.get("idList")), None)
    if not lista:
        return PlainTextResponse("invalid value for idList", status_code=400)
    card = {
        "id": f"id{next(_seq)}", "idBoard": lista["idBoard"], "idList": lista["id"], "name": p.get("name", ""),
        "desc": p.get("desc", ""), "idLabels": _lista_de(p.get("idLabels", [])), "due": p.get("due"), "idMembers": [], "closed": False,
    }
    db["cards"].append(card)
    return card


@app.put("/1/cards/{card_id}")
async def atualizar_card(card_id: str, request: Request):
    card = next((c for c in db["cards"] if c["id"] == card_id), None)
    if not card:
        return PlainTextResponse("The requested resource was not found.", status_code=404)
    p = await _params(request)
    for campo in ("name", "desc", "idList", "due"):
        if campo in p:
            card[campo] = p[campo]
    if "idLabels" in p:
        card["idLabels"] = _lista_de(p["idLabels"])
    if "closed" in p:
        card["closed"] = str(p["closed"]).lower() == "true"
    return card


if __name__ == "__main__":
    print(f"mock Trello em http://localhost:{PORTA}/1", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORTA, log_level="warning")
