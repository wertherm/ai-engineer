"""Lendo o /metrics do vLLM como o Prometheus lê.

Counters e histogramas são CUMULATIVOS desde que o servidor subiu. Para saber o que
aconteceu numa janela, tire uma "foto" antes, gere tráfego, tire outra e subtraia.
É exatamente o que a função rate()/increase() do PromQL faz.
"""
import os
import re

import httpx
from openai import OpenAI

URL = os.getenv("VLLM_URL", "http://localhost:8000")
LINHA = re.compile(r'^(?P<nome>[a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(?P<labels>[^}]*)\})?\s+(?P<valor>[-+0-9.eE]+|NaN)$')


def foto() -> dict[tuple[str, str], float]:
    """Formato texto do Prometheus -> {(nome, labels): valor}. Ignora # HELP e # TYPE."""
    dados = {}
    for linha in httpx.get(f"{URL}/metrics").text.splitlines():
        m = LINHA.match(linha)
        if m and m["nome"].startswith("vllm:"):
            dados[(m["nome"], m["labels"] or "")] = float(m["valor"])
    return dados


def soma(dados: dict, nome: str) -> float:
    """Soma a métrica em todos os conjuntos de labels (ex.: request_success por finished_reason)."""
    return sum(v for (n, _), v in dados.items() if n == nome)


def percentil(antes: dict, depois: dict, base: str, p: float) -> float:
    """Percentil aproximado a partir dos buckets do histograma (como histogram_quantile)."""
    buckets = []
    for (n, labels), v in depois.items():
        if n == f"{base}_bucket":
            le = re.search(r'le="([^"]+)"', labels)[1]
            buckets.append((float(le), v - antes.get((n, labels), 0.0)))
    buckets.sort()
    total = buckets[-1][1]
    for limite, acumulado in buckets:  # 1º bucket que cobre p% das observações
        if acumulado >= p * total:
            return limite
    return float("inf")


antes = foto()
client = OpenAI(base_url=URL + "/v1", api_key="local")
for i in range(5):
    client.chat.completions.create(
        model="qwen-mini",
        messages=[{"role": "user", "content": f"Dê uma dica curta de Kubernetes número {i}."}],
        max_tokens=30,
        temperature=0,
    )
depois = foto()


def delta(nome: str) -> float:
    return soma(depois, nome) - soma(antes, nome)


reqs = delta("vllm:request_success_total")
print(f"requisições concluídas na janela : {reqs:.0f}")
print(f"tokens de entrada / saída        : {delta('vllm:prompt_tokens_total'):.0f} / {delta('vllm:generation_tokens_total'):.0f}")
print(f"TTFT médio                       : {delta('vllm:time_to_first_token_seconds_sum') / reqs * 1000:.0f} ms")
print(f"TTFT p95 (pelo bucket)           : <= {percentil(antes, depois, 'vllm:time_to_first_token_seconds', 0.95) * 1000:.0f} ms")
print(f"ITL médio                        : {delta('vllm:inter_token_latency_seconds_sum') / delta('vllm:inter_token_latency_seconds_count') * 1000:.0f} ms")
print(f"latência ponta a ponta média     : {delta('vllm:e2e_request_latency_seconds_sum') / reqs * 1000:.0f} ms")
hits, consultas = delta("vllm:prefix_cache_hits_total"), delta("vllm:prefix_cache_queries_total")
print(f"prefix cache hit rate            : {hits / consultas:.0%}" if consultas else "prefix cache: sem consultas")
print(f"agora: rodando={soma(depois, 'vllm:num_requests_running'):.0f} "
      f"na fila={soma(depois, 'vllm:num_requests_waiting'):.0f} "
      f"KV cache={soma(depois, 'vllm:kv_cache_usage_perc'):.1%}")
