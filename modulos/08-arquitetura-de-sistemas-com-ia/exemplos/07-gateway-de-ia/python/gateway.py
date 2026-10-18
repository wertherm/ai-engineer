"""Exemplo 07 (Python) · AI Gateway mínimo em FastAPI: o ponto único por onde TODA chamada de IA passa.

Concentra o que não deve ficar espalhado nos serviços: identificação do tenant, rate limit, política de tiers
(Policy-Driven Control), tracing (traceparent W3C), log estruturado, custo e métricas Prometheus.
Lê a MESMA configuração do JS (../gateway.config.json); só a porta muda (PORTA, default 30850).
"""

import json
import os
import re
import secrets
import sys
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, disable_created_metrics, generate_latest

from comum_py.llm import MODELO_CHAT, chat, ms_desde

CFG = json.loads((Path(__file__).parent.parent / "gateway.config.json").read_text(encoding="utf-8"))
PORTA = int(os.environ.get("PORTA", 30850))

# Métricas no formato texto do Prometheus. Registry próprio (não o global) e sem as séries *_created.
disable_created_metrics()
REGISTRY = CollectorRegistry()
REQUISICOES = Counter("gateway_requisicoes", "Requisições por tenant, tier e status", ["tenant", "tier", "status"], registry=REGISTRY)
TOKENS = Counter("gateway_tokens", "Tokens consumidos", ["tenant", "tier"], registry=REGISTRY)
CUSTO = Counter("gateway_custo_usd", "Custo estimado em US$", ["tenant"], registry=REGISTRY)

# Token bucket por tenant: aguenta rajadas até "capacidade" e recarrega devagar.
baldes: dict[str, dict] = {}


def consumir_ficha(tenant: str) -> bool:
    rl = CFG["tenants"][tenant]["rateLimit"]
    agora = time.time()
    b = baldes.setdefault(tenant, {"fichas": rl["capacidade"], "em": agora})
    b["fichas"] = min(rl["capacidade"], b["fichas"] + (agora - b["em"]) * rl["recargaPorSeg"])
    b["em"] = agora
    if b["fichas"] < 1:
        return False
    b["fichas"] -= 1
    return True


TRACEPARENT = re.compile(r"00-([0-9a-f]{32})-[0-9a-f]{16}-0[01]")


def trace(req: Request) -> str:
    """traceparent W3C: 00-<trace-id 32 hex>-<span-id 16 hex>-01. Reaproveita o trace do chamador se vier."""
    m = TRACEPARENT.fullmatch(req.headers.get("traceparent", ""))
    return m[1] if m else secrets.token_hex(16)


app = FastAPI(title="AI Gateway (módulo 08)")


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


# "def" (não "async def"): a chamada ao LLM é síncrona e o FastAPI a roda num thread pool, sem travar o loop.
@app.post("/v1/chat")
def chat_endpoint(req: Request, corpo: dict) -> JSONResponse:
    trace_id = trace(req)
    t0 = time.perf_counter()
    tenant = req.headers.get("x-tenant")
    mensagem, tier = corpo.get("mensagem", ""), corpo.get("tier", "barato")
    conhecido = tenant in CFG["tenants"]

    def responder(status: int, dados: dict, **extra) -> JSONResponse:
        # Label só com valores conhecidos: header livre como label explode a cardinalidade do Prometheus.
        REQUISICOES.labels(tenant if conhecido else "desconhecido", tier, str(status)).inc()
        print(json.dumps({"traceId": trace_id, "tenant": tenant, "tier": tier, "status": status, "ms": ms_desde(t0), **extra},
                         ensure_ascii=False, separators=(",", ":")), flush=True)
        return JSONResponse(dados, status_code=status, headers={"x-trace-id": trace_id})

    # Cada recusa acontece ANTES de gastar token: é aqui que o gateway economiza dinheiro.
    if not conhecido:
        return responder(401, {"erro": "tenant desconhecido"})
    if tier not in CFG["tenants"][tenant]["tiers"]:
        return responder(403, {"erro": f"tier {tier} não permitido para {tenant}"})
    if not consumir_ficha(tenant):
        return responder(429, {"erro": "rate limit"})
    try:
        t = CFG["tiers"][tier]
        # O prompt NÃO vai para o log (pode ter dado pessoal); vai o tamanho.
        r = chat([{"role": "user", "content": mensagem}], max_tokens=t["maxTokens"])
        u = r["usage"]
        usd = (u.prompt_tokens * t["precoIn"] + u.completion_tokens * t["precoOut"]) / 1e6
        TOKENS.labels(tenant, tier).inc(u.total_tokens)
        CUSTO.labels(tenant).inc(usd)
        return responder(200, {"resposta": r["texto"], "tokens": u.total_tokens}, modelo=MODELO_CHAT,
                         promptChars=len(mensagem), tokens=u.total_tokens, usd=round(usd, 6))
    except Exception as err:  # noqa: BLE001
        return responder(502, {"erro": "upstream falhou"}, erro=str(err))


if __name__ == "__main__":
    print(f"gateway ouvindo em http://localhost:{PORTA}", file=sys.stderr, flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORTA, log_level="warning", access_log=False)
