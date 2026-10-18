"""Testes da política de resiliência e da fila em memória (sem LLM, rodam em < 1 s)."""

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from agentes import com_resiliencia, instavel, lento  # noqa: E402
from fila import FilaMemoria  # noqa: E402


async def eco(e: dict) -> dict:
    return {**e, "ok": True}


def test_retry_recupera_agente_que_falha_2_vezes():
    r = asyncio.run(com_resiliencia("x", instavel(eco, 2), {}, tentativas=3))
    assert r["ok"] is True


def test_timeout_interrompe_agente_travado_e_esgota_tentativas():
    with pytest.raises(RuntimeError, match="esgotou 2 tentativas: timeout"):
        asyncio.run(com_resiliencia("x", lento(eco, 300), {}, tentativas=2, timeout_ms=50))


def test_fila_em_memoria_manda_para_dlq_depois_de_max_tentativas():
    async def cenario():
        fila = FilaMemoria(max_tentativas=2)

        async def sempre_falha(_):
            raise RuntimeError("sempre falha")

        await fila.consumir("t", sempre_falha)
        await fila.publicar("t", {"id": 1})
        await asyncio.sleep(0.2)
        return fila.dlq

    dlq = asyncio.run(cenario())
    assert len(dlq) == 1
    assert dlq[0]["tentativas"] == 2
