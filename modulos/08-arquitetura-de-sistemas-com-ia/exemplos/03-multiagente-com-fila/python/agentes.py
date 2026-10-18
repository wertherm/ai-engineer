""""Agentes" com contrato estável: recebem um estado (dict) e devolvem um estado enriquecido.

Determinísticos e com latência simulada (asyncio.sleep) para que o foco seja a ARQUITETURA (coordenação,
falhas, estado). Em produção, o corpo de cada um seria uma chamada de LLM (ver módulo 04).
"""

import asyncio
import re
from collections.abc import Awaitable, Callable

Agente = Callable[[dict], Awaitable[dict]]


async def extrator(estado: dict) -> dict:
    await asyncio.sleep(0.030)
    m = re.search(r"R\$ ?([\d.]+)", estado["pedido"])
    valor = int(m.group(1).replace(".", "", 1)) if m else 0
    return {**estado, "valor": valor, "cliente": estado["pedido"].split(":")[0]}


async def risco(estado: dict) -> dict:
    await asyncio.sleep(0.050)
    return {**estado, "risco": "alto" if estado["valor"] > 50000 else "baixo"}


async def fraude(estado: dict) -> dict:
    await asyncio.sleep(0.040)
    return {**estado, "fraude": "suspeita" if estado["cliente"] == "ACME" else "ok"}


async def redator(estado: dict) -> dict:
    await asyncio.sleep(0.020)
    aprova = estado["risco"] == "baixo" and estado.get("fraude") != "suspeita"
    return {**estado, "parecer": f"{estado['cliente']}: {'APROVADO' if aprova else 'ENCAMINHAR PARA ANALISTA'}"}


AGENTES: dict[str, Agente] = {"extrator": extrator, "risco": risco, "fraude": fraude, "redator": redator}


def instavel(fn: Agente, falhas_iniciais: int) -> Agente:
    """Embrulha um agente para falhar nas N primeiras chamadas (simula nó instável / rede)."""
    chamadas = 0

    async def wrapper(estado: dict) -> dict:
        nonlocal chamadas
        chamadas += 1
        if chamadas <= falhas_iniciais:
            raise RuntimeError(f"falha simulada #{chamadas}")
        return await fn(estado)

    return wrapper


def lento(fn: Agente, ms: int) -> Agente:
    """Embrulha um agente para demorar demais (simula nó travado)."""

    async def wrapper(estado: dict) -> dict:
        await asyncio.sleep(ms / 1000)
        return await fn(estado)

    return wrapper


async def com_resiliencia(nome: str, fn: Agente, estado: dict, *, tentativas: int = 3, timeout_ms: int = 200,
                          log: Callable[[str], None] = lambda s: None) -> dict:
    """Política do chamador: timeout por tentativa + retry com backoff exponencial.

    Sem timeout, um agente travado trava o sistema inteiro; sem limite de tentativas, um bug vira loop caro.
    asyncio.wait_for CANCELA a tentativa que estourou (no JS, o Promise.race só a abandona).
    """
    for i in range(1, tentativas + 1):
        try:
            return await asyncio.wait_for(fn(estado), timeout_ms / 1000)
        except Exception as err:  # noqa: BLE001 (qualquer falha do agente conta como tentativa)
            msg = f"timeout {timeout_ms} ms" if isinstance(err, TimeoutError) else str(err)
            log(f"  {nome}: tentativa {i}/{tentativas} falhou ({msg})")
            if i == tentativas:
                raise RuntimeError(f"{nome} esgotou {tentativas} tentativas: {msg}") from err
            await asyncio.sleep(10 * 2**i / 1000)
    raise AssertionError("inalcançável")
