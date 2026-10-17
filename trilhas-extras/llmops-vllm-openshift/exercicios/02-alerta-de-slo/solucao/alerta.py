"""Solução do exercício 02: alerta de SLO de TTFT a partir do /metrics.

Uso: uv run python alerta.py --limite-ms 1000 [--requisicoes 3]
Sai com código 0 (dentro do SLO) ou 1 (violou) -> serve para cron, CI ou um health check.
"""
import argparse
import os
import re
import sys

import httpx
from openai import OpenAI

URL = os.getenv("VLLM_URL", "http://localhost:8000")
# Nome de métrica Prometheus aceita dígitos: "[a-z_:]+" não casaria com vllm:e2e_request_latency_seconds.
LINHA = re.compile(r"^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+(\S+)$")


def ler(nomes: set[str]) -> dict[str, float]:
    valores = dict.fromkeys(nomes, 0.0)
    for linha in httpx.get(f"{URL}/metrics", timeout=10).text.splitlines():
        m = LINHA.match(linha)
        if m and m[1] in nomes:
            valores[m[1]] += float(m[2])
    return valores


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limite-ms", type=float, required=True, help="TTFT médio máximo aceitável")
    ap.add_argument("--requisicoes", type=int, default=3, help="tráfego sintético gerado na janela")
    a = ap.parse_args()

    soma, cont = "vllm:time_to_first_token_seconds_sum", "vllm:time_to_first_token_seconds_count"
    antes = ler({soma, cont})
    client = OpenAI(base_url=URL + "/v1", api_key="local")
    for i in range(a.requisicoes):  # tráfego sintético ("probe"): garante dado na janela
        client.completions.create(model="qwen-mini", prompt=f"probe {i}", max_tokens=1)
    depois = ler({soma, cont})

    n = depois[cont] - antes[cont]
    if n == 0:
        print("ALERTA: nenhuma requisição observada na janela")
        return 1
    ttft_ms = (depois[soma] - antes[soma]) / n * 1000
    ok = ttft_ms <= a.limite_ms
    print(f"{'OK' if ok else 'ALERTA'}: TTFT médio {ttft_ms:.0f} ms em {n:.0f} requisições (limite {a.limite_ms:.0f} ms)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
