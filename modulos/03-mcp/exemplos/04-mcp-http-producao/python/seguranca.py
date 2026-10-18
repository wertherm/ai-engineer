"""Peças de segurança/governança do servidor HTTP: service tokens, rate limit e auditoria.

São middlewares ASGI puros (funcionam em qualquer app Starlette/FastAPI) encaixados em volta do app
que o MCPServer gera. O SDK Python já traz a parte de Bearer: TokenVerifier + AuthSettings.
"""

import hashlib
import json
import math
import sys
import time
from datetime import UTC, datetime

from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser
from mcp.server.auth.provider import AccessToken
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


# Service tokens: guardamos SÓ o hash (vazou o arquivo/banco, não vazou o token).
# Em produção viriam de um secret manager/banco; aqui são tokens de demonstração.
_expira = int(time.time()) + 3600
TOKENS = {
    sha256("tok-copilot-demo"): {"client_id": "copilot-interno", "scopes": ["produtos:ler"], "expira_em": _expira},
    sha256("tok-ide-demo"): {"client_id": "plugin-ide", "scopes": ["produtos:ler"], "expira_em": _expira},
    sha256("tok-sem-escopo"): {"client_id": "curioso", "scopes": [], "expira_em": _expira},
    sha256("tok-vencido"): {"client_id": "antigo", "scopes": ["produtos:ler"], "expira_em": int(time.time()) - 60},
}


class VerificadorDeTokens:
    """Implementa o protocolo TokenVerifier do SDK: devolve AccessToken ou None (None => 401)."""

    async def verify_token(self, token: str) -> AccessToken | None:
        registro = TOKENS.get(sha256(token))
        if registro is None:
            return None
        # expires_at é OPCIONAL no Python (no JS é obrigatório), mas se vier no passado o SDK recusa (401).
        return AccessToken(token=token, client_id=registro["client_id"], scopes=registro["scopes"],
                           expires_at=registro["expira_em"])


def _cliente(scope: Scope) -> str | None:
    user = scope.get("user")
    return user.access_token.client_id if isinstance(user, AuthenticatedUser) else None


async def _responder_json(send: Send, status: int, corpo: dict, headers: dict[str, str]) -> None:
    dados = json.dumps(corpo).encode()
    cab = [(b"content-type", b"application/json"), (b"content-length", str(len(dados)).encode())]
    cab += [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    await send({"type": "http.response.start", "status": status, "headers": cab})
    await send({"type": "http.response.body", "body": dados})


class RateLimitPorCliente:
    """Janela fixa por client_id (precisa vir DEPOIS do AuthenticationMiddleware, que preenche scope["user"]).

    Simples e suficiente para 1 instância; com várias réplicas o contador vai para um store compartilhado
    (Redis) ou para o gateway/WAF. Requisição sem token passa reto: quem responde 401 é o SDK logo adiante.
    """

    def __init__(self, app: ASGIApp, limite: int, janela_s: float) -> None:
        self.app, self.limite, self.janela_s = app, limite, janela_s
        self.janelas: dict[str, list[float]] = {}  # client_id -> [inicio, contagem]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        chave = _cliente(scope) if scope["type"] == "http" and scope["path"] == "/mcp" else None
        if chave is None:
            return await self.app(scope, receive, send)
        agora = time.monotonic()
        j = self.janelas.get(chave)
        if j is None or agora - j[0] >= self.janela_s:
            j = self.janelas[chave] = [agora, 0]
        j[1] += 1
        if j[1] > self.limite:
            retry = math.ceil(j[0] + self.janela_s - agora)
            return await _responder_json(send, 429, {
                "jsonrpc": "2.0", "id": None,
                "error": {"code": -32000, "message": f"Limite de {self.limite} req por {self.janela_s:g}s excedido"},
            }, {"Retry-After": str(retry), "RateLimit-Limit": str(self.limite), "RateLimit-Remaining": "0"})
        await self.app(scope, receive, send)


class Auditoria:
    """Log de auditoria em JSON Lines (stdout): quem chamou o quê, quando e com qual resultado.

    É o middleware mais externo: registra também as tentativas barradas (401/403/429/421).
    Lê o corpo para extrair o método JSON-RPC e devolve os mesmos bytes ao app (replay do receive).
    Nunca logar o token nem argumentos sensíveis por inteiro.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] != "/mcp":
            return await self.app(scope, receive, send)
        inicio = time.perf_counter()
        mensagens: list[Message] = []
        corpo = b""
        while True:
            msg = await receive()
            mensagens.append(msg)
            corpo += msg.get("body", b"")
            if msg["type"] != "http.request" or not msg.get("more_body"):
                break

        async def replay() -> Message:
            return mensagens.pop(0) if mensagens else await receive()

        status = 0

        async def send_espiando(msg: Message) -> None:
            nonlocal status
            if msg["type"] == "http.response.start":
                status = msg["status"]
            await send(msg)

        try:
            await self.app(scope, replay, send_espiando)
        finally:
            try:
                rpc = json.loads(corpo) if corpo else {}
            except ValueError:
                rpc = {}
            rpc = rpc if isinstance(rpc, dict) else {}
            print(json.dumps({
                "ts": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                "cliente": _cliente(scope),
                "ip": (scope.get("client") or ("?",))[0],
                "metodo_http": scope["method"],
                "rpc": rpc.get("method"),
                "tool": (rpc.get("params") or {}).get("name") if rpc.get("method") == "tools/call" else None,
                "status": status,
                "ms": round((time.perf_counter() - inicio) * 1000),
            }, ensure_ascii=False), flush=True)
