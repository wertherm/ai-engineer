# 06 · Carga, continuous batching e custo por token

**Conceito novo:** comportamento **sob concorrência**. O vLLM junta várias requisições no mesmo passo
(**continuous batching**): o throughput total sobe com a concorrência até saturar, enquanto a latência de
cada requisição piora. Daí sai o **custo por 1M tokens**.
**Pré-requisito:** [exemplo 04](../04-metricas-prometheus/). Teoria em [docs/04](../../docs/04-metricas-e-observabilidade.md) e [docs/08](../../docs/08-custo-e-capacidade.md).

## Como rodar

```bash
uv run python exemplos/06-carga-e-custo/carga.py          # custo-hora padrão: R$ 2,50
uv run python exemplos/06-carga-e-custo/carga.py 4.00     # com o seu custo-hora
```

## Saída esperada

Saída real (2026-10-13, 8 núcleos, 6 deles para a inferência). Leva ~2 min:

```
conc | p50 (s) | p95 (s) | tokens/s | R$ / 1M tokens
   1 |    5.42 |    5.68 |     11.7 |          59.52
   2 |    8.44 |    8.95 |     15.0 |          46.38
   4 |   13.89 |   14.08 |     18.3 |          37.89
   8 |   28.37 |   28.38 |     18.0 |          38.50
```

O que observar:
- De 1 para 4 requisições simultâneas, o throughput subiu **56%**: é o continuous batching trabalhando.
- De 4 para 8 o throughput **parou** e a latência **dobrou**: a CPU saturou. Mais concorrência só gera fila.
- O custo por token cai com o throughput. O ponto ótimo é o **maior throughput que ainda cumpre o SLO** de latência.
- `ignore_eos` força todas as respostas a terem 64 tokens: sem isso, a comparação entre níveis seria injusta.

## Alternativa: benchmark oficial do vLLM

O vLLM traz um benchmark pronto. Rode de dentro do container:

```bash
docker exec vllm-estudo vllm bench serve --backend vllm --model Qwen/Qwen2.5-0.5B-Instruct \
  --served-model-name qwen-mini --endpoint /v1/completions --dataset-name random \
  --random-input-len 128 --random-output-len 32 --num-prompts 8 --max-concurrency 4 --seed 7
```

Trecho real da saída:

```
Successful requests:                     8
Output token throughput (tok/s):         7.78
Mean TTFT (ms):                          8273.10
P99 TTFT (ms):                           11541.71
Mean TPOT (ms):                          263.34
Mean ITL (ms):                           263.34
```

Os números são piores que os do `carga.py` porque o prompt aleatório tem 128 tokens (mais prefill) e os
prompts não se repetem. Em produção, a doc do vLLM recomenda o [GuideLLM](https://github.com/vllm-project/guidellm).

## Experimente

1. Troque `TOKENS_SAIDA` para 16 e para 128 e veja como o custo por token muda.
2. Rode o [exemplo 04](../04-metricas-prometheus/) ao mesmo tempo e veja `na fila` > 0 no nível 8.
3. Refaça a conta de custo supondo 30% de utilização média: o custo por token triplica.
