"""Duas filas com a MESMA interface (Clear Interfaces): trocar memória por Postgres não muda os agentes.

    await publicar(topico, payload)   -> grava/enfileira a mensagem
    await consumir(topico, handler)   -> handler(payload) é chamado para cada mensagem; se lançar erro, a
                                         mensagem volta para a fila até max_tentativas, depois vai para a DLQ
"""

import asyncio
from collections.abc import Awaitable, Callable

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

Handler = Callable[[dict], Awaitable[None]]


class FilaMemoria:
    def __init__(self, *, max_tentativas: int = 3):
        self.max_tentativas = max_tentativas
        self.handlers: dict[str, list[Handler]] = {}
        self.dlq: list[dict] = []  # dead-letter queue: mensagens que esgotaram as tentativas
        self._tarefas: set[asyncio.Task] = set()  # referência forte: task sem referência pode sumir no GC

    def _agendar(self, coro) -> None:
        tarefa = asyncio.create_task(coro)
        self._tarefas.add(tarefa)
        tarefa.add_done_callback(self._tarefas.discard)

    async def publicar(self, topico: str, payload: dict) -> None:
        # call_soon = entrega assíncrona, como numa fila real (o produtor não espera o consumidor).
        loop = asyncio.get_running_loop()
        for handler in self.handlers.get(topico, []):
            msg = {"payload": payload, "tentativas": 0}
            loop.call_soon(self._agendar, self._processar(topico, handler, msg))

    async def consumir(self, topico: str, handler: Handler) -> None:
        self.handlers.setdefault(topico, []).append(handler)

    async def _processar(self, topico: str, handler: Handler, msg: dict) -> None:
        try:
            await handler(msg["payload"])
        except Exception as err:  # noqa: BLE001
            msg["tentativas"] += 1
            if msg["tentativas"] >= self.max_tentativas:
                self.dlq.append({"topico": topico, **msg, "erro": str(err)})
            else:  # backoff exponencial
                asyncio.get_running_loop().call_later(
                    0.020 * 2 ** msg["tentativas"], self._agendar, self._processar(topico, handler, msg))

    async def fechar(self) -> None:
        self.handlers.clear()


class FilaPostgres:
    """Fila durável no Postgres: a tabela é a fonte da verdade e o LISTEN/NOTIFY só "acorda" o consumidor.

    Se o processo cair, as mensagens 'pendente' continuam lá (o NOTIFY sozinho se perderia). O claim com
    FOR UPDATE SKIP LOCKED permite vários consumidores sem processar a mesma mensagem duas vezes.
    Tabela m08.mensagens_py e canais com prefixo "py_" para não colidir com a versão JS.
    """

    def __init__(self, conninfo: str, *, max_tentativas: int = 3):
        self.conninfo = conninfo
        self.max_tentativas = max_tentativas
        self.handlers: dict[str, Handler] = {}
        self._tarefas: set[asyncio.Task] = set()

    async def iniciar(self) -> None:
        # Duas conexões: uma para comandos e outra só para ouvir (a que ouve fica presa no notifies()).
        self.conn = await psycopg.AsyncConnection.connect(self.conninfo, autocommit=True)
        self.ouvinte = await psycopg.AsyncConnection.connect(self.conninfo, autocommit=True)
        await self.conn.execute("""
            CREATE SCHEMA IF NOT EXISTS m08;
            CREATE TABLE IF NOT EXISTS m08.mensagens_py (
              id bigserial PRIMARY KEY, topico text NOT NULL, payload jsonb NOT NULL,
              status text NOT NULL DEFAULT 'pendente', tentativas int NOT NULL DEFAULT 0,
              erro text, criado_em timestamptz NOT NULL DEFAULT now());
            TRUNCATE m08.mensagens_py;""")
        self._escuta = asyncio.create_task(self._escutar())

    async def _escutar(self) -> None:
        # notifies(timeout=...) devolve o controle a cada 100 ms: assim um LISTEN novo (consumir) consegue
        # usar a conexão entre uma espera e outra.
        while True:
            async for n in self.ouvinte.notifies(timeout=0.1):
                tarefa = asyncio.create_task(self._drenar(n.channel.removeprefix("py_")))
                self._tarefas.add(tarefa)
                tarefa.add_done_callback(self._tarefas.discard)
            await asyncio.sleep(0)

    async def publicar(self, topico: str, payload: dict) -> None:
        # INSERT e NOTIFY no mesmo comando (mesma transação): o aviso só sai se a mensagem foi gravada.
        await self.conn.execute(
            """WITH m AS (INSERT INTO m08.mensagens_py (topico, payload) VALUES (%(t)s, %(p)s) RETURNING id)
               SELECT pg_notify(%(canal)s, id::text) FROM m""",
            {"t": topico, "p": Jsonb(payload), "canal": f"py_{topico}"},
        )

    async def consumir(self, topico: str, handler: Handler) -> None:
        self.handlers[topico] = handler
        await self.ouvinte.execute(sql.SQL("LISTEN {}").format(sql.Identifier(f"py_{topico}")))
        await self._drenar(topico)  # processa o que já estava pendente antes de assinar

    async def _drenar(self, topico: str) -> None:
        handler = self.handlers[topico]
        while True:
            linha = await (await self.conn.execute(
                """UPDATE m08.mensagens_py SET status = 'processando', tentativas = tentativas + 1
                   WHERE id = (SELECT id FROM m08.mensagens_py WHERE topico = %s AND status = 'pendente'
                               ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
                   RETURNING id, payload, tentativas""", (topico,))).fetchone()
            if linha is None:
                return
            id_, payload, tentativas = linha
            try:
                await handler(payload)
                await self.conn.execute("UPDATE m08.mensagens_py SET status = 'feito' WHERE id = %s", (id_,))
            except Exception as err:  # noqa: BLE001
                status = "dlq" if tentativas >= self.max_tentativas else "pendente"
                await self.conn.execute("UPDATE m08.mensagens_py SET status = %s, erro = %s WHERE id = %s",
                                        (status, str(err), id_))

    async def fechar(self) -> None:
        self._escuta.cancel()
        for t in [*self._tarefas]:
            t.cancel()
        await self.ouvinte.close()
        await self.conn.close()
