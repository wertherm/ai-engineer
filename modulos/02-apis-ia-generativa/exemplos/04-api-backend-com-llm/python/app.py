"""API FastAPI que integra o LLM (versão Python de app.js): rotas versionadas (/v1), Bearer token,
validação de entrada antes de gastar tokens e falha do provedor mapeada para 502.

O LLM entra por injeção de dependência (`Depends(obter_llm)`): nos testes,
`app.dependency_overrides[obter_llm]` troca o LLM por um dublê, sem rede.
"""

import json
import logging
import secrets
import time
from functools import cache

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

log = logging.getLogger("api")


@cache
def obter_llm():
    """Dependência do LLM real, criada uma vez (import tardio: os testes nem tocam no SDK)."""
    from llm import LlmResumidor

    return LlmResumidor()


class PedidoResumo(BaseModel):
    model_config = ConfigDict(extra="forbid")  # additionalProperties: false
    # max_length protege o bolso: texto maior = mais tokens = mais custo e latência.
    texto: str = Field(min_length=20, max_length=4000)


class Resumo(BaseModel):
    resumo: str
    modelo: str
    tokens: int
    versao: str


def criar_app(token: str) -> FastAPI:
    app = FastAPI(title="Resumos com LLM", version="1.0.0")
    bearer = HTTPBearer(auto_error=False)

    def exigir_token(cred: HTTPAuthorizationCredentials | None = Depends(bearer)) -> None:
        # compare_digest: comparação em tempo constante, não vaza o token pelo tempo de resposta.
        if cred is None or not secrets.compare_digest(cred.credentials.encode(), token.encode()):
            raise HTTPException(401, detail="token ausente ou inválido", headers={"WWW-Authenticate": "Bearer"})

    # Saúde fica fora da versão e sem auth (load balancer e Kubernetes chamam isso).
    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    # Tudo que é contrato público mora sob /v1. Uma mudança incompatível vira /v2, ao lado.
    v1 = APIRouter(prefix="/v1", dependencies=[Depends(exigir_token)])

    @v1.post("/resumos", response_model=Resumo)
    def resumir(pedido: PedidoResumo, llm=Depends(obter_llm)) -> Resumo:
        # `def` (não `async def`): a chamada ao SDK é bloqueante e o FastAPI a roda num threadpool.
        inicio = time.perf_counter()
        try:
            r = llm.resumir(pedido.texto)
        except Exception as e:
            # Falha do provedor não é erro do cliente nem 500 genérico: 502 = a dependência upstream falhou.
            log.error(json.dumps({"msg": "falha no LLM", "erro": str(e)[:80]}, ensure_ascii=False))
            raise HTTPException(502, detail="provedor de IA indisponível") from e
        log.info(json.dumps({"msg": "resumo gerado", "tokens": r["tokens"], "ms": round((time.perf_counter() - inicio) * 1000)}))
        return Resumo(resumo=r["resumo"], modelo=llm.modelo, tokens=r["tokens"], versao="v1")

    app.include_router(v1)
    return app
