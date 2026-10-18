"""Testes da cota (versão pytest de cota.test.js): dublê do serviço (sem LLM) + contador em memória; e o
contador no Postgres real (rápido, sem LLM) com 20 incrementos SIMULTÂNEOS quando INTEGRACAO=1."""

import asyncio
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))  # cota.py vizinho (pastas com hífen não são pacotes)
from cota import ContadorMemoria, cota_diaria, criar_contador_pg  # noqa: E402

from app_py.api import build_app  # noqa: E402
from app_py.db import criar_pool  # noqa: E402

TENANTS = {
    "k-free": {"id": "padaria", "nome": "Padaria", "plano": "free", "cotaDiaria": 2},
    "k-pro": {"id": "acme", "nome": "Acme", "plano": "pro", "cotaDiaria": 200},
}


async def autenticar(k):
    return TENANTS.get(k)


def app_com(contador) -> TestClient:
    servico = AsyncMock()
    servico.perguntar.return_value = {"resposta": "ok [1]", "modo": "rag", "citacoes": [], "verificado": True, "cache": False, "ms": 1}
    servico.listar_documentos.return_value = []
    return TestClient(build_app(servico=servico, autenticar=autenticar, ganchos=[cota_diaria(contador)]))


def perguntar(c: TestClient, chave: str, pergunta: str = "Quantos dias de férias?"):
    return c.post("/v1/perguntas", headers={"authorization": f"Bearer {chave}"}, json={"pergunta": pergunta})


def test_plano_free_2_perguntas_passam_a_3a_recebe_429_com_upgrade():
    c = app_com(ContadorMemoria())
    r = [perguntar(c, "k-free") for _ in range(3)]
    assert [x.status_code for x in r] == [200, 200, 429]
    assert r[1].headers["x-cota-restante"] == "0"
    assert "upgrade" in r[2].json()["erro"]


def test_a_cota_de_um_tenant_nao_afeta_o_outro():
    c = app_com(ContadorMemoria())
    for _ in range(3):
        perguntar(c, "k-free")
    assert perguntar(c, "k-pro").status_code == 200


def test_a_cota_zera_na_virada_do_dia():
    hoje = [datetime(2026, 10, 16, 23, 59, tzinfo=UTC)]
    c = app_com(ContadorMemoria(agora=lambda: hoje[0]))
    for _ in range(3):
        perguntar(c, "k-free")
    hoje[0] = datetime(2026, 10, 17, 0, 1, tzinfo=UTC)
    assert perguntar(c, "k-free").status_code == 200


def test_so_post_perguntas_consome_cota_e_get_uso_mostra_o_consumo():
    c = app_com(ContadorMemoria())
    perguntar(c, "k-free")
    perguntar(c, "k-free", pergunta="x")  # 400 de validação: não consome
    c.get("/v1/documentos", headers={"authorization": "Bearer k-free"})
    uso = c.get("/v1/uso", headers={"authorization": "Bearer k-free"})
    assert uso.json() == {"tenant": "padaria", "plano": "free", "limite": 2, "usadasHoje": 1}


@pytest.mark.skipif(os.environ.get("INTEGRACAO") != "1", reason="integração: rode com INTEGRACAO=1")
def test_contador_pg_incremento_atomico_com_20_requisicoes_simultaneas():
    async def cenario():
        pool = await criar_pool()  # pool de 5 conexões: os 20 incrementos disputam conexões de verdade
        try:
            contador = await criar_contador_pg(pool)
            async with pool.connection() as c:
                await c.execute("DELETE FROM m11.uso_diario_py WHERE tenant_id = 'teste-concorrencia'")
            valores = await asyncio.gather(*(contador.incrementar("teste-concorrencia") for _ in range(20)))
            total = await contador.consultar("teste-concorrencia")
            async with pool.connection() as c:
                await c.execute("DELETE FROM m11.uso_diario_py WHERE tenant_id = 'teste-concorrencia'")
            return valores, total
        finally:
            await pool.close()

    valores, total = asyncio.run(cenario())
    assert len(set(valores)) == 20  # nenhum valor repetido = nenhuma corrida
    assert total == 20
