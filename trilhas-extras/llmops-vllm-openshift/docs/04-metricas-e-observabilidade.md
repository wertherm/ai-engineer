# 05 · Métricas e observabilidade

## Objetivo

Saber **quais números** dizem se um serviço de LLM está saudável, de onde eles vêm e como medi-los
direito.

## As métricas que importam

| Métrica | Definição | O usuário sente como |
|---|---|---|
| **TTFT** | tempo do envio até o 1º token | "demorou pra começar a responder" |
| **ITL / TPOT** | intervalo médio entre tokens: `(latência total − TTFT) / (tokens − 1)` | "está digitando devagar" |
| **Latência e2e** | TTFT + tempo de geração | tempo total de espera |
| **Throughput** | tokens de saída por segundo, somando todas as requisições | quantos usuários cabem |
| **Concorrência** | requisições em execução (`running`) e na fila (`waiting`) | fila = latência crescendo |
| **Uso de KV cache** | fração do cache ocupada (0–1) | perto de 1 = preempção e fila |

Olhe **percentis** (p50, p95, p99), não só a média: a média esconde o usuário que esperou 30 s.

## Cliente × servidor

- **Do lado do cliente** ([exemplo 03](../exemplos/03-streaming-ttft-itl/)): você mede o que o usuário vê,
  incluindo rede. Bom para testes de ponta a ponta.
- **Do lado do servidor** ([exemplo 04](../exemplos/04-metricas-prometheus/)): o vLLM mede tudo e expõe em
  `/metrics`. É o que vai para dashboards e alertas.

## O /metrics do vLLM

Formato texto do Prometheus. Nomes conferidos na versão 0.31.0:

| Métrica | Tipo | Uso |
|---|---|---|
| `vllm:num_requests_running` / `vllm:num_requests_waiting` | gauge | concorrência e fila |
| `vllm:kv_cache_usage_perc` | gauge | ocupação do KV cache (0–1) |
| `vllm:time_to_first_token_seconds` | histograma | TTFT |
| `vllm:inter_token_latency_seconds` | histograma | ITL |
| `vllm:e2e_request_latency_seconds` | histograma | latência total |
| `vllm:request_queue_time_seconds` | histograma | tempo esperando na fila |
| `vllm:prompt_tokens_total` / `vllm:generation_tokens_total` | counter | tokens de entrada e de saída |
| `vllm:request_success_total{finished_reason=...}` | counter | término por `stop`, `length`, `abort`, `error` |
| `vllm:prefix_cache_queries_total` / `vllm:prefix_cache_hits_total` | counter | taxa de acerto do prefix cache |

**Counters e histogramas são cumulativos** desde que o processo subiu. Para uma janela, faça a diferença
entre duas leituras. No PromQL:

```promql
# TTFT médio nos últimos 5 min
rate(vllm:time_to_first_token_seconds_sum[5m]) / rate(vllm:time_to_first_token_seconds_count[5m])
# TTFT p95
histogram_quantile(0.95, rate(vllm:time_to_first_token_seconds_bucket[5m]))
# tokens gerados por segundo
rate(vllm:generation_tokens_total[1m])
```

O [projeto final](../projeto-final/) sobe um Prometheus que coleta esse endpoint: abra
http://localhost:9090 e teste as consultas acima.

## Próximo nível: tracing

Métricas dizem **que** algo está lento; tracing diz **onde**, por requisição: qual prompt, quantos
tokens, qual etapa do RAG. Ferramentas atuais:

- **OpenTelemetry GenAI semantic conventions**: atributos padrão como `gen_ai.request.model` e
  `gen_ai.usage.input_tokens`. Ainda estão em status *Development* e os nomes de métrica já mudaram.
- **Langfuse** (open source, self-host via Docker Compose): recebe OTLP e tem um *drop-in* para o SDK OpenAI
  (`from langfuse.openai import OpenAI`).

## Armadilhas

- Benchmark sem fixar o tamanho da saída: use `ignore_eos` e o mesmo `max_tokens` (o [exemplo 06](../exemplos/06-carga-e-custo/) faz isso).
- Não descartar o aquecimento: a 1ª requisição em CPU leva ~2 min.
- Ferramentas definem ITL de jeitos diferentes (com ou sem o 1º token). Não compare números de ferramentas diferentes.
- Logar prompts e respostas com dados pessoais nos traces.
- Parser de métricas com regex errada: nomes Prometheus aceitam dígitos (`e2e`).

## Fontes

- Métricas do vLLM: https://docs.vllm.ai/en/latest/usage/metrics.html e https://docs.vllm.ai/en/latest/design/metrics.html
- NVIDIA, conceitos de benchmark: https://developer.nvidia.com/blog/llm-benchmarking-fundamental-concepts/
- PromQL `histogram_quantile`: https://prometheus.io/docs/prometheus/latest/querying/functions/#histogram_quantile
- OTel GenAI: https://github.com/open-telemetry/semantic-conventions-genai
- Langfuse + OpenTelemetry: https://langfuse.com/integrations/native/opentelemetry
