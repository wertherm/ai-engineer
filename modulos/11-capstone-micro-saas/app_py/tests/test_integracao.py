"""Integração REAL (Postgres + embeddings do Ollama; sem LLM de chat, então leva segundos) — versão pytest
de app/test/integracao.test.js. Pré-requisito: uv run python -m app_py.seed.
Rode com: INTEGRACAO=1 uv run pytest app_py/tests/test_integracao.py"""

import asyncio
import os

import pytest

from app_py.db import criar_pool
from app_py.llm import criar_llm
from app_py.servico import criar_servico
from app_py.tenants import criar_autenticador

pytestmark = pytest.mark.skipif(os.environ.get("INTEGRACAO") != "1", reason="integração: rode com INTEGRACAO=1")


def rodar(fn):
    """Cada teste abre e fecha o seu pool dentro do próprio event loop (pool async é preso ao loop)."""

    async def _():
        pool = await criar_pool()
        try:
            return await fn(pool)
        finally:
            await pool.close()

    return asyncio.run(_())


def test_a_api_key_resolve_o_tenant_certo():
    async def t(pool):
        autenticar = criar_autenticador(pool)
        assert (await autenticar("sk-acme-demo"))["id"] == "acme"
        assert await autenticar("sk-inexistente") is None

    rodar(t)


def test_busca_nunca_devolve_documento_de_outro_tenant():
    async def t(pool):
        s = criar_servico(pool=pool, llm=criar_llm())
        acme = await s.buscar({"id": "acme"}, "troca de turno na padaria", k=8, canal="teste")
        padaria = await s.buscar({"id": "padaria"}, "auxílio home office e VPN", k=8, canal="teste")
        assert acme and all("Acme" in t["conteudo"] for t in acme)
        assert padaria and all("Padaria" in t["conteudo"] for t in padaria)
        assert "home-office.md" in [d["fonte"] for d in await s.listar_documentos({"id": "acme"})]
        assert "home-office.md" not in [d["fonte"] for d in await s.listar_documentos({"id": "padaria"})]

    rodar(t)


def test_delete_de_documento_inexistente_nao_apaga_o_cache():
    async def t(pool):
        s = criar_servico(pool=pool, llm=criar_llm())

        async def contar():
            async with pool.connection() as c:
                return (await (await c.execute("SELECT count(*)::int AS n FROM m11.cache_py WHERE tenant_id = 'acme'")).fetchone())["n"]

        antes = await contar()
        assert (await s.remover({"id": "acme"}, "nao-existe.md", canal="teste"))["removidos"] == 0
        assert await contar() == antes

    rodar(t)


def test_pergunta_fora_do_tema_responde_fallback_sem_chamar_o_chat():
    async def t(pool):
        llm = criar_llm()

        async def chat_proibido(*_a, **_k):
            raise AssertionError("não deveria chamar o chat")

        llm.chat = chat_proibido
        s = criar_servico(pool=pool, llm=llm)
        r = await s.perguntar({"id": "padaria", "nome": "Padaria"}, "Qual o limite de alimentação em viagem?", canal="teste")
        assert r["resposta"].startswith("Não encontrei")

    rodar(t)
