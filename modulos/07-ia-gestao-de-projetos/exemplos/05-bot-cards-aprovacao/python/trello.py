"""Cliente mínimo da API do Trello. Funciona igual no mock e no api.trello.com."""
import os

import httpx

BASE = os.environ.get("TRELLO_BASE_URL", "http://localhost:30750/1")
AUTH = {"key": os.environ.get("TRELLO_KEY", "mock"), "token": os.environ.get("TRELLO_TOKEN", "mock")}

_http = httpx.Client(base_url=BASE, params=AUTH, timeout=30)


def _chamar(metodo: str, caminho: str, corpo: dict | None = None):
    r = _http.request(metodo, caminho, json=corpo)
    if r.is_error:
        raise RuntimeError(f"Trello {metodo} {caminho}: {r.status_code} {r.text}")
    return r.json()


def listas(board: str):
    return _chamar("GET", f"/boards/{board}/lists")


def etiquetas(board: str):
    return _chamar("GET", f"/boards/{board}/labels")


def cards(board: str):
    return _chamar("GET", f"/boards/{board}/cards")


def criar_card(dados: dict):
    return _chamar("POST", "/cards", dados)


def atualizar_card(card_id: str, dados: dict):
    return _chamar("PUT", f"/cards/{card_id}", dados)
