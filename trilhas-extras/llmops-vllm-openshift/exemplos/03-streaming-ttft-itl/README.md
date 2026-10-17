# 03 · Streaming, TTFT e ITL

**Conceito novo:** com `stream=True` os tokens chegam conforme são gerados. Daí saem as duas latências
que o usuário sente: **TTFT** (tempo até o 1º token, dominado pelo *prefill*) e **ITL** (intervalo entre
tokens, ritmo do *decode*).
**Pré-requisito:** [exemplo 02](../02-tokens-e-sampling/). Teoria em [docs/02](../../docs/02-fundamentos-de-llm.md) e [docs/04](../../docs/04-metricas-e-observabilidade.md).

## Como rodar

Rode **duas vezes seguidas** e compare:

```bash
uv run python exemplos/03-streaming-ttft-itl/streaming.py
uv run python exemplos/03-streaming-ttft-itl/streaming.py
```

## Saída esperada

Saída real (2026-10-13, CPU de 8 núcleos). Os tempos variam com a máquina:

```
== prompt curto ==
   resposta: 'Olá! Como posso ajudar você hoje?'
   TTFT=375 ms | ITL médio=59 ms | total=1031 ms | pedaços=11
== prompt longo (~700 tokens) ==
   resposta: 'OpenShift é uma plataforma de software de código aberto desenvolvida p'
   TTFT=10255 ms | ITL médio=88 ms | total=13510 ms | pedaços=37
```

Segunda execução:

```
== prompt longo (~700 tokens) ==
   TTFT=2786 ms | ITL médio=87 ms | total=6009 ms | pedaços=37
```

O que observar:
- **Prompt longo → TTFT alto.** O *prefill* processa todos os tokens de entrada antes do 1º token sair.
- **O ITL quase não muda** com o tamanho do prompt: o *decode* gera um token por vez de qualquer jeito.
- **Na 2ª execução o TTFT do prompt longo caiu ~4x.** É o **prefix caching**: o vLLM reaproveitou o KV
  cache do prefixo igual. Por isso benchmarks repetidos no mesmo servidor ficam "bons demais".

## Experimente

1. Mude uma palavra no começo do prompt longo e rode de novo: o cache não serve mais e o TTFT volta a subir.
2. Aumente `max_tokens` para 200: o total cresce, o TTFT não.
3. Calcule `TTFT + (pedaços - 1) × ITL` e compare com o total medido.
