"""Exemplo 03 (Python) · Multi-agente: Sequential, Parallel e Supervisor, conversando por fila e asyncio,
com falha de nó, retry/timeout, DLQ e uma fila durável no Postgres (LISTEN/NOTIFY, schema m08)."""

import asyncio
import time

from agentes import AGENTES, com_resiliencia, instavel, lento
from fila import FilaMemoria, FilaPostgres

from comum_py.llm import DATABASE_URL, ms_desde

PEDIDOS = ["Padaria Sol: antecipar R$ 12.000", "ACME: antecipar R$ 80.000"]
log = print


async def pipeline_sequencial(fila, etapas, pedidos) -> list[dict]:
    """Monta um pipeline sobre QUALQUER fila: cada agente lê de um tópico e publica no próximo.
    Os agentes não se conhecem (Loose Coupling); só conhecem o nome do tópico de saída."""
    resultados: list[dict] = []
    fim = asyncio.Event()

    async def coletar(estado):
        resultados.append(estado)
        if len(resultados) == len(pedidos):
            fim.set()

    await fila.consumir("saida", coletar)
    for i, (nome, fn) in enumerate(etapas):
        destino = etapas[i + 1][0] if i + 1 < len(etapas) else "saida"

        async def etapa(estado, fn=fn, destino=destino):  # default args: fixa fn/destino de CADA volta
            await fila.publicar(destino, await fn(estado))

        await fila.consumir(nome, etapa)
    for pedido in pedidos:
        await fila.publicar(etapas[0][0], {"pedido": pedido})
    try:
        await asyncio.wait_for(fim.wait(), 3)
    except TimeoutError:
        pass
    return resultados


async def main() -> None:
    log("== 1. Sequential (fila em memória): extrator -> risco -> fraude -> redator ==")
    fila = FilaMemoria(max_tentativas=3)
    # O agente de fraude falha 2 vezes: a própria fila reentrega com backoff (at-least-once).
    etapas = [("extrator", AGENTES["extrator"]), ("risco", AGENTES["risco"]),
              ("fraude", instavel(AGENTES["fraude"], 2)), ("redator", AGENTES["redator"])]
    t0 = time.perf_counter()
    for e in await pipeline_sequencial(fila, etapas, PEDIDOS):
        log(f"  {e['parecer']}")
    log(f"  tempo total: {ms_desde(t0)} ms · DLQ: {len(fila.dlq)} mensagens")
    await fila.fechar()

    log("\n== 2. Parallel (fan-out/fan-in): risco e fraude ao mesmo tempo ==")
    t0 = time.perf_counter()
    base = await AGENTES["extrator"]({"pedido": PEDIDOS[1]})
    # return_exceptions=True (≈ Promise.allSettled): uma falha não derruba as outras análises.
    risco, fraude = await asyncio.gather(
        com_resiliencia("risco", AGENTES["risco"], base),
        com_resiliencia("fraude", lento(AGENTES["fraude"], 500), base, tentativas=2, timeout_ms=100, log=log),
        return_exceptions=True,
    )
    estado = {**base, **({} if isinstance(risco, Exception) else risco),
              "fraude": "indisponivel" if isinstance(fraude, Exception) else fraude["fraude"]}
    log(f"  risco={estado['risco']} fraude={estado['fraude']} (resultado parcial, degradação graciosa)")
    log(f"  {(await AGENTES['redator'](estado))['parecer']} · {ms_desde(t0)} ms")

    log("\n== 3. Supervisor: decide o próximo agente a partir do estado ==")

    # Política do supervisor. Em produção pode ser um LLM escolhendo o próximo agente; aqui é função pura.
    def proximo(e: dict) -> str | None:
        if "cliente" not in e:
            return "extrator"
        if "risco" not in e:
            return "risco"
        if e["risco"] == "alto" and "fraude" not in e:
            return "fraude"
        return "redator" if "parecer" not in e else None

    time_ = {**AGENTES, "fraude": instavel(AGENTES["fraude"], 1)}
    for pedido in PEDIDOS:
        estado, trilha = {"pedido": pedido}, []
        for _ in range(6):  # limite de passos = guarda contra loop
            nome = proximo(estado)
            if nome is None:
                break
            trilha.append(nome)
            estado = await com_resiliencia(nome, time_[nome], estado, log=log)
        log(f"  {' -> '.join(trilha)} => {estado['parecer']}")

    log("\n== 4. Sequential sobre fila DURÁVEL no Postgres (LISTEN/NOTIFY, m08.mensagens_py) ==")
    fila = FilaPostgres(DATABASE_URL, max_tentativas=2)
    await fila.iniciar()

    # O redator está quebrado de vez: depois de 2 tentativas a mensagem vai para 'dlq', sem travar o resto.
    async def quebrado(_estado):
        raise RuntimeError("redator fora do ar")

    etapas = [("extrator", AGENTES["extrator"]), ("risco", AGENTES["risco"]), ("redator", quebrado)]
    await pipeline_sequencial(fila, etapas, PEDIDOS[:1])
    cur = await fila.conn.execute(
        "SELECT topico, status, tentativas, coalesce(erro, '') FROM m08.mensagens_py ORDER BY id")
    for topico, status, tentativas, erro in await cur.fetchall():
        log(f"  {topico:<9} {status:<9} tentativas={tentativas} {erro}")
    await fila.fechar()


asyncio.run(main())
