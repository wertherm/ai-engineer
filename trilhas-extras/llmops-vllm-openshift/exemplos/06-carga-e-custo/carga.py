"""Teste de carga: o que acontece com latência e throughput quando a concorrência sobe.

Continuous batching: o vLLM junta várias requisições no mesmo passo de decode.
Por isso o throughput TOTAL sobe com a concorrência, enquanto a latência de CADA
requisição piora um pouco. O ponto certo é o maior throughput que ainda cumpre o SLO.

Uso: uv run python exemplos/06-carga-e-custo/carga.py [custo_hora_em_reais]
"""
import asyncio
import os
import statistics
import sys
import time

from openai import AsyncOpenAI

client = AsyncOpenAI(base_url=os.getenv("VLLM_URL", "http://localhost:8000") + "/v1", api_key="local")
REQS_POR_NIVEL = 8
TOKENS_SAIDA = 64
CUSTO_HORA = float(sys.argv[1]) if len(sys.argv) > 1 else 2.50  # R$/h de uma VM de 8 vCPU (hipótese; troque pelo seu)


async def uma_requisicao(i: int) -> tuple[float, int]:
    inicio = time.perf_counter()
    r = await client.completions.create(
        model="qwen-mini",
        prompt=f"Pedido {i}: escreva um parágrafo sobre containers.",  # prompts diferentes: sem prefix cache inflando
        max_tokens=TOKENS_SAIDA,
        temperature=0,
        extra_body={"ignore_eos": True},  # força exatamente TOKENS_SAIDA tokens: medição comparável
    )
    return time.perf_counter() - inicio, r.usage.completion_tokens


async def nivel(concorrencia: int) -> dict:
    semaforo = asyncio.Semaphore(concorrencia)  # no máximo N requisições em voo

    async def limitada(i):
        async with semaforo:
            return await uma_requisicao(i)

    inicio = time.perf_counter()
    resultados = await asyncio.gather(*(limitada(concorrencia * 100 + i) for i in range(REQS_POR_NIVEL)))
    duracao = time.perf_counter() - inicio
    latencias = sorted(r[0] for r in resultados)
    tokens = sum(r[1] for r in resultados)
    return {
        "conc": concorrencia,
        "p50": statistics.median(latencias),
        "p95": latencias[int(0.95 * (len(latencias) - 1))],
        "tok_s": tokens / duracao,
    }


async def main():
    await uma_requisicao(0)  # aquecimento: não entra na conta
    print(f"{'conc':>4} | {'p50 (s)':>7} | {'p95 (s)':>7} | {'tokens/s':>8} | {'R$ / 1M tokens':>14}")
    for conc in (1, 2, 4, 8):
        m = await nivel(conc)
        # custo por 1M tokens de saída = custo da hora / tokens gerados numa hora (a 100% de uso)
        custo_1m = CUSTO_HORA / (m["tok_s"] * 3600) * 1_000_000
        print(f"{m['conc']:>4} | {m['p50']:>7.2f} | {m['p95']:>7.2f} | {m['tok_s']:>8.1f} | {custo_1m:>14.2f}")
    print(f"\nHipótese de custo: R$ {CUSTO_HORA:.2f}/h e 100% de utilização (na vida real, divida pela utilização média).")


asyncio.run(main())
