# 09 · Custo e capacidade

## Objetivo

Calcular quanto custa servir 1 milhão de tokens no seu próprio vLLM, comparar com uma API paga e
estimar quantas réplicas você precisa.

## Custo por 1M tokens (self-hosting)

```
custo_por_1M = custo_hora_da_infra / (tokens_por_segundo × 3600 × utilização_média) × 1.000.000
```

- `tokens_por_segundo`: o **throughput sustentado que ainda cumpre o SLO** de latência, medido com carga
  ([exemplo 06](../exemplos/06-carga-e-custo/), `vllm bench serve` ou GuideLLM). Não use o pico.
- `utilização_média`: a máquina não fica 100% ocupada 24 h. Com 30% de uso, o custo por token triplica.

Números reais deste repo (CPU de 8 núcleos, hipótese de R$ 2,50/h, 100% de utilização):

| Concorrência | tokens/s | R$ / 1M tokens |
|---|---|---|
| 1 | 11,7 | 59,52 |
| 4 | 18,3 | 37,89 |
| 8 | 18,0 | 38,50 (saturou; só a latência piorou) |

Em CPU o custo por token é alto. Uma GPU custa mais por hora, mas gera **centenas a milhares** de tokens/s
com continuous batching: o custo por token cai em ordens de grandeza. Refaça a conta com o seu hardware.

## API × self-hosting

```
custo_API     = tokens_entrada/1M × preço_entrada + tokens_saída/1M × preço_saída
ponto_equilíbrio (tokens/mês) = custo_fixo_mensal / (preço_API_por_token − custo_marginal_self_host_por_token)
```

Some ao self-hosting o que não aparece na conta da máquina: pessoas operando, armazenamento, tráfego de
saída, ociosidade e **réplicas mínimas** (alta disponibilidade = pelo menos 2 réplicas sempre ligadas).

Self-hosting costuma valer quando: há **volume alto e constante**, **dados que não podem sair** da sua
infraestrutura, necessidade de um modelo customizado (fine-tuning) ou de **latência previsível**.

## Capacidade: quantas réplicas?

1. Defina o SLO (ex.: TTFT p95 ≤ 2 s, ITL ≤ 100 ms).
2. Meça com carga crescente o **maior throughput por réplica que cumpre o SLO**.
3. `réplicas = pico_de_tokens_por_segundo / throughput_por_réplica`, arredondado para cima, + 1 de folga.
4. Monitore `vllm:num_requests_waiting` e `vllm:kv_cache_usage_perc`: fila crescendo ou cache perto de 1
   significa que faltou réplica (ou KV cache).

## Alavancas para baratear

| Alavanca | Efeito | Custo |
|---|---|---|
| Modelo menor (destilado) | muito mais tokens/s | qualidade: **avalie** ([docs/05](05-avaliacao.md)) |
| Quantização (AWQ, GPTQ, INT8/FP8) | menos memória, mais throughput | pequena perda de qualidade; em CPU x86, só AWQ, GPTQ e INT8 W8A8 |
| Prefix caching (ligado por padrão) | prompts de sistema longos e repetidos ficam quase de graça | nenhum |
| `max_tokens` adequado | evita respostas longas sem necessidade | nenhum |
| Escalar a zero fora do horário | tira a ociosidade | o 1º usuário espera o boot (~minutos) |

## Armadilhas

- Calcular com throughput de pico e 100% de utilização.
- Esquecer o custo dos tokens de **entrada** (RAG com contexto grande gasta mais em prefill que em decode).
- Comparar preço por token entre modelos com tokenizers diferentes.

## Fontes

- NVIDIA, métricas de benchmark: https://developer.nvidia.com/blog/llm-benchmarking-fundamental-concepts/
- Benchmark do vLLM: https://docs.vllm.ai/en/latest/benchmarking/cli.html
- GuideLLM: https://github.com/vllm-project/guidellm
- Quantização no vLLM: https://docs.vllm.ai/en/latest/features/quantization/
