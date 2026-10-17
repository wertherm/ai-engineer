# 04 · Métricas do vLLM (formato Prometheus)

**Conceito novo:** observabilidade do **lado do servidor**. O vLLM publica em `/metrics` contadores e
histogramas no formato do Prometheus. Eles são **cumulativos**: para medir uma janela, tire uma foto
antes, gere tráfego, tire outra e subtraia (é o que `rate()`/`increase()` fazem no PromQL).
**Pré-requisito:** [exemplo 03](../03-streaming-ttft-itl/) (as mesmas métricas, agora medidas pelo servidor).
Teoria em [docs/04](../../docs/04-metricas-e-observabilidade.md).

## Como rodar

```bash
curl -s localhost:8000/metrics | grep -E '^vllm:(num_requests|kv_cache|time_to_first_token_seconds_(sum|count))'
uv run python exemplos/04-metricas-prometheus/metricas.py
```

## Saída esperada

Saída real (2026-10-13):

```
requisições concluídas na janela : 5
tokens de entrada / saída        : 210 / 150
TTFT médio                       : 363 ms
TTFT p95 (pelo bucket)           : <= 500 ms
ITL médio                        : 63 ms
latência ponta a ponta média     : 2193 ms
prefix cache hit rate            : 0%
agora: rodando=0 na fila=0 KV cache=0.0%
```

Confira a conta: 363 ms + 29 × 63 ms ≈ 2190 ms. As métricas batem entre si.

> **Bug real que apareceu aqui:** a primeira versão usava a regex `[a-z_:]+` para o nome da métrica e a
> latência ponta a ponta saía **0 ms**. Motivo: `e2e` tem um dígito. Nomes Prometheus seguem
> `[a-zA-Z_:][a-zA-Z0-9_:]*`. Valide parsers contra a saída real, não contra a sua suposição.

## Experimente

1. Rode o [exemplo 06](../06-carga-e-custo/) em outro terminal e observe `rodando` e `na fila` subirem.
2. Repita a mesma pergunta 5 vezes e veja o `prefix cache hit rate` subir.
3. Procure no `/metrics` a métrica `vllm:request_success_total` e os valores de `finished_reason`.
