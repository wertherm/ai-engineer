"""Streaming e as duas latências que o usuário sente.

TTFT (time to first token): quanto demora para aparecer a 1ª palavra -> dominado pelo prefill.
ITL  (inter-token latency): intervalo entre um token e o próximo -> ritmo do decode.
Latência total = TTFT + (tokens - 1) * ITL médio.
"""
import os
import statistics
import time

from openai import OpenAI

client = OpenAI(base_url=os.getenv("VLLM_URL", "http://localhost:8000") + "/v1", api_key="local")


def medir(prompt: str, max_tokens: int = 50) -> dict:
    inicio = time.perf_counter()
    instantes = []  # momento de chegada de cada pedaço com texto
    texto = []
    stream = client.chat.completions.create(
        model="qwen-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0,
        stream=True,  # o servidor manda os tokens via Server-Sent Events conforme gera
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:  # o 1º chunk costuma vir vazio (só com o "role"): não conta para TTFT
            instantes.append(time.perf_counter())
            texto.append(delta)
    fim = time.perf_counter()
    intervalos = [b - a for a, b in zip(instantes, instantes[1:])]
    return {
        "texto": "".join(texto),
        "ttft_ms": (instantes[0] - inicio) * 1000,
        "itl_ms": statistics.mean(intervalos) * 1000,
        "total_ms": (fim - inicio) * 1000,
        "pedacos": len(instantes),
    }


curto = "Diga só: olá."
longo = "Resuma em uma frase o texto a seguir. " + "OpenShift é uma plataforma Kubernetes da Red Hat. " * 60

for nome, prompt in [("prompt curto", curto), ("prompt longo (~700 tokens)", longo)]:
    m = medir(prompt)
    print(f"== {nome} ==")
    print(f"   resposta: {m['texto'][:70]!r}")
    print(f"   TTFT={m['ttft_ms']:.0f} ms | ITL médio={m['itl_ms']:.0f} ms | total={m['total_ms']:.0f} ms | pedaços={m['pedacos']}")
