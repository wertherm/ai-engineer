"""Barramento de mensagens assíncrono: cada agente tem uma caixa de entrada (asyncio.Queue) e consome mensagens no
próprio ritmo. Ninguém chama o outro diretamente: só publica mensagens.
Em produção isto seria Redis Streams, NATS, SQS, Kafka... a ideia é a mesma."""

import asyncio
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any


@dataclass
class Mensagem:
    de: str
    para: str
    tipo: str
    conteudo: Any
    t: str


class Barramento:
    def __init__(self) -> None:
        self._filas: defaultdict[str, asyncio.Queue[Mensagem]] = defaultdict(asyncio.Queue)
        self._t0 = time.perf_counter()
        self.historico: list[Mensagem] = []

    def enviar(self, de: str, para: str, tipo: str, conteudo: Any) -> None:
        msg = Mensagem(de, para, tipo, conteudo, f"{time.perf_counter() - self._t0:.1f}")
        self.historico.append(msg)
        print(f"  [{msg.t}s] {de} -> {para} ({tipo})")
        self._filas[para].put_nowait(msg)  # fila sem limite: enviar nunca bloqueia

    async def receber(self, agente: str) -> Mensagem:
        """Espera a próxima mensagem da caixa de entrada do agente (não bloqueia os outros)."""
        return await self._filas[agente].get()
