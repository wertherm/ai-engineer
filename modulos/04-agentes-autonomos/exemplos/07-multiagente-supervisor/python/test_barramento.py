"""Executor e supervisor sem LLM: o barramento entrega na ordem e o executor recusa plano acima do orçamento."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from agentes import executor  # noqa: E402
from barramento import Barramento  # noqa: E402


def test_executor_recusa_e_depois_conclui():
    async def cenario():
        bus = Barramento()
        tarefa = asyncio.create_task(executor(bus))
        req = {"pessoas": 12, "dia": "sexta", "orcamento": 150}
        bus.enviar("supervisor", "executor", "executar", {"plano": {"itens": ["cafe", "suco", "frutas"], "dia": "sexta"}, "requisitos": req})
        falha = await bus.receber("supervisor")
        bus.enviar("supervisor", "executor", "executar", {"plano": {"itens": ["pao", "cafe"], "dia": "sexta"}, "requisitos": req})
        ok = await bus.receber("supervisor")
        bus.enviar("supervisor", "executor", "encerrar", None)
        await tarefa
        return falha, ok

    falha, ok = asyncio.run(cenario())
    assert falha.tipo == "falha" and falha.conteudo["motivo"] == "custo R$ 180 > orçamento R$ 150"
    assert ok.tipo == "concluido" and ok.conteudo["total"] == 66
    assert ok.conteudo["feitos"] == ["cotação ok: R$ 66", "sala reservada: sexta", "12 convites enviados"]
