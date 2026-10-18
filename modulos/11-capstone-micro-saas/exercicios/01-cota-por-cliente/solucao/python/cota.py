"""Solução do exercício 01 (versão Python): cota DIÁRIA de perguntas ao LLM por cliente (tenant), conforme o plano.
Diferente do rate limit (protege o servidor de rajadas, por minuto), a cota protege a MARGEM do Micro-SaaS:
cada pergunta custa tokens, e o plano free não pode consumir como o pro.

Ligar na API de verdade (app_py/server.py): build_app(..., ganchos=[cota_diaria(contador_pg)]), com o
contador criado no lifespan: contador_pg = await criar_contador_pg(pool).
"""

from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import ValidationError

from app_py.api import PerguntaIn


class ContadorMemoria:
    """Contador em memória (testes e 1 réplica). `agora` injetável para testar a virada do dia."""

    def __init__(self, agora: Callable[[], datetime] = lambda: datetime.now(UTC)):
        self.agora, self.usos = agora, {}

    def _chave(self, tenant_id: str) -> str:
        return f"{tenant_id}:{self.agora().astimezone(UTC).date().isoformat()}"  # dia em UTC, como o toISOString do JS

    async def incrementar(self, tenant_id: str) -> int:
        k = self._chave(tenant_id)
        self.usos[k] = self.usos.get(k, 0) + 1
        return self.usos[k]

    async def consultar(self, tenant_id: str) -> int:
        return self.usos.get(self._chave(tenant_id), 0)


class ContadorPg:
    """Contador no Postgres (N réplicas da API compartilham o mesmo número). O UPSERT com RETURNING é
    atômico: duas requisições simultâneas nunca leem o mesmo valor (sem "read-then-write")."""

    def __init__(self, pool):
        self.pool = pool

    async def incrementar(self, tenant_id: str) -> int:
        async with self.pool.connection() as c:
            cur = await c.execute(
                """INSERT INTO m11.uso_diario_py (tenant_id, dia, perguntas) VALUES (%s, current_date, 1)
                   ON CONFLICT (tenant_id, dia) DO UPDATE SET perguntas = m11.uso_diario_py.perguntas + 1
                   RETURNING perguntas""",
                [tenant_id],
            )
            return (await cur.fetchone())["perguntas"]

    async def consultar(self, tenant_id: str) -> int:
        async with self.pool.connection() as c:
            cur = await c.execute("SELECT perguntas FROM m11.uso_diario_py WHERE tenant_id = %s AND dia = current_date", [tenant_id])
            linha = await cur.fetchone()
            return linha["perguntas"] if linha else 0


async def criar_contador_pg(pool) -> ContadorPg:
    async with pool.connection() as c:
        await c.execute("""CREATE TABLE IF NOT EXISTS m11.uso_diario_py (
            tenant_id text NOT NULL, dia date NOT NULL, perguntas int NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, dia))""")
    return ContadorPg(pool)


def cota_diaria(contador) -> Callable[[APIRouter], None]:
    """Gancho para o build_app (parâmetro `ganchos`): recebe o router /v1, que já passou pela autenticação
    (request.state.tenant existe). Só conta POST /v1/perguntas e expõe GET /v1/uso."""

    async def verificar(request: Request, response: Response) -> None:
        if request.method != "POST" or request.scope["route"].path != "/v1/perguntas":
            return
        # No Fastify o preHandler roda DEPOIS da validação. No FastAPI as dependências rodam antes de o erro de
        # validação ser levantado; então conferimos o corpo aqui: pedido inválido (400) não consome cota.
        try:
            PerguntaIn.model_validate_json(await request.body())
        except ValidationError:
            return
        tenant = request.state.tenant
        limite = tenant.get("cotaDiaria") or 50
        usadas = await contador.incrementar(tenant["id"])
        cab = {"X-Cota-Limite": str(limite), "X-Cota-Restante": str(max(0, limite - usadas))}
        if usadas > limite:
            # 429 com mensagem de NEGÓCIO (upgrade de plano), não só "tente depois".
            raise HTTPException(429, headers=cab, detail={
                "erro": f"cota diária do plano {tenant['plano']} esgotada ({limite} perguntas). Faça upgrade ou aguarde até amanhã."})
        response.headers.update(cab)

    def gancho(v1: APIRouter) -> None:
        v1.dependencies.append(Depends(verificar))

        @v1.get("/uso", summary="Consumo da cota diária do tenant")
        async def uso(request: Request) -> dict:
            t = request.state.tenant
            return {"tenant": t["id"], "plano": t["plano"], "limite": t.get("cotaDiaria"), "usadasHoje": await contador.consultar(t["id"])}

    return gancho
