# 07 · AI Gateway mínimo: tenant, rate limit, política de tiers, tracing e métricas

**Conceito novo:** o **gateway** como ponto único de controle da arquitetura enterprise (camada "API Gateway" do
[doc 04](../../docs/04-arquitetura-enterprise.md)): identifica o tenant, aplica token bucket, valida tiers pela
política (`gateway.config.json`), propaga `traceparent` (W3C Trace Context), loga em JSON estruturado **sem o
prompt** e expõe `/metrics` no formato Prometheus. Só `node:http`.

**Pré-requisito:** [exemplo 06](../06-hitl-approval-gate/). Porta `30806` livre.

## Como rodar

```bash
npm run ex07            # sobe o gateway como processo filho, roda 4 cenários (2 chamadas ao LLM) e derruba pelo PID
npm run ex07:server     # só o servidor, para testar com curl:
curl -s localhost:30806/v1/chat -H 'x-tenant: loja-a' -H 'content-type: application/json' -d '{"mensagem":"oi"}'
```

## Saída esperada

```text
1) loja-a, tier barato, com traceparent do chamador:
   200 trace=4bf92f3577b34da6a3ce929d0e0e4736 → {"resposta":"Custo do Depósito Interbancário.","tokens":31}
2) free pedindo tier caro (política):
   403 → {"erro":"tier caro não permitido para free"}
3) free, rajada de 3 pedidos simultâneos (balde com 1 ficha):
   200 → {"resposta":"1","tokens":22}
   429 → {"erro":"rate limit"}
   429 → {"erro":"rate limit"}
4) tenant desconhecido:
   401

Logs estruturados do gateway (stdout):
   {"traceId":"4bf92f3577b34da6a3ce929d0e0e4736","tenant":"loja-a","tier":"barato","status":200,"ms":6101,"modelo":"qwen3.5:4b","promptChars":25,"tokens":31,"usd":0.00001}
   {"traceId":"a9b39e48e22f99ee715ee700c72747b6","tenant":"free","tier":"caro","status":403,"ms":0}
   {"traceId":"47ef4a2109848302a7027d32856cc130","tenant":"free","tier":"barato","status":429,"ms":0}
   ...
GET /metrics:
   gateway_tokens_total{tenant="loja-a",tier="barato"} 31
   gateway_custo_usd_total{tenant="loja-a"} 0.0000096
   gateway_requisicoes_total{tenant="free",tier="barato",status="429"} 2
   gateway_requisicoes_total{tenant="desconhecido",tier="barato",status="401"} 1
   ...
```

Repare: as recusas (401/403/429) custam **0 ms e 0 token**; o trace id do chamador atravessou o gateway; o tenant
inválido vira label `desconhecido` (header livre como label explodiria a cardinalidade do Prometheus). E o modelo
errou a definição ("Custo do Depósito Interbancário"): o gateway controla custo e acesso, **não** qualidade.

## Experimente

1. Suba `recargaPorSeg` do tenant `free` para `10` e repita a rajada: os 429 somem.
2. Mande um `traceparent` inválido e veja o gateway gerar um trace novo.
3. Aponte um Prometheus para `/metrics` (ver [trilha LLMOps](../../../../trilhas-extras/llmops-vllm-openshift/docs/04-metricas-e-observabilidade.md)).

## Versão Python

[`python/gateway.py`](python/gateway.py) em **FastAPI** (servido pelo `uvicorn`) com métricas do `prometheus_client`
(registry próprio, `disable_created_metrics()` para não gerar as séries `*_created`), e
[`python/teste.py`](python/teste.py), que sobe o gateway como processo filho, dispara os 4 cenários com `httpx`
(a rajada com `asyncio.gather`) e o derruba pelo PID (`Popen.terminate()`). Lê o mesmo
[`gateway.config.json`](gateway.config.json); só a porta muda: **30850** (`PORTA`). O endpoint é `def` (não
`async def`): a chamada síncrona ao LLM roda no thread pool do FastAPI sem travar o event loop.

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/07-gateway-de-ia/python/teste.py     # 4 cenários (2 chamadas ao LLM) e derruba pelo PID
uv run python exemplos/07-gateway-de-ia/python/gateway.py   # só o servidor, para testar com curl:
curl -s localhost:30850/v1/chat -H 'x-tenant: loja-a' -H 'content-type: application/json' -d '{"mensagem":"oi"}'
```

**Saída esperada (Python)** — saída real:

```text
1) loja-a, tier barato, com traceparent do chamador:
   200 trace=4bf92f3577b34da6a3ce929d0e0e4736 → {"resposta":"Custo do Depósito Interbancário.","tokens":31}
2) free pedindo tier caro (política):
   403 → {"erro":"tier caro não permitido para free"}
3) free, rajada de 3 pedidos simultâneos (balde com 1 ficha):
   200 → {"resposta":"1","tokens":22}
   429 → {"erro":"rate limit"}
   429 → {"erro":"rate limit"}
4) tenant desconhecido:
   401

Logs estruturados do gateway (stdout):
   {"traceId":"4bf92f3577b34da6a3ce929d0e0e4736","tenant":"loja-a","tier":"barato","status":200,"ms":1813,"modelo":"qwen3.5:4b","promptChars":25,"tokens":31,"usd":1e-05}
   {"traceId":"843444c75d9c125fc5abd3ede112e7ce","tenant":"free","tier":"caro","status":403,"ms":0}
   {"traceId":"9147ac7b3cd316fc27aaa4dee1f4f624","tenant":"free","tier":"barato","status":429,"ms":0}
   {"traceId":"da5554483afd927669da1c76d79b31db","tenant":"free","tier":"barato","status":429,"ms":0}
   {"traceId":"2d19522ada27191e48db1b774ed4c2ea","tenant":"free","tier":"barato","status":200,"ms":426,"modelo":"qwen3.5:4b","promptChars":23,"tokens":22,"usd":4e-06}
   {"traceId":"3f1d1873cb981c5c2655b42a9fa8383c","tenant":"hacker","tier":"barato","status":401,"ms":0}

GET /metrics:
   # HELP gateway_requisicoes_total Requisições por tenant, tier e status
   # TYPE gateway_requisicoes_total counter
   gateway_requisicoes_total{status="200",tenant="loja-a",tier="barato"} 1.0
   gateway_requisicoes_total{status="403",tenant="free",tier="caro"} 1.0
   gateway_requisicoes_total{status="429",tenant="free",tier="barato"} 2.0
   gateway_requisicoes_total{status="200",tenant="free",tier="barato"} 1.0
   gateway_requisicoes_total{status="401",tenant="desconhecido",tier="barato"} 1.0
   # HELP gateway_tokens_total Tokens consumidos
   # TYPE gateway_tokens_total counter
   gateway_tokens_total{tenant="loja-a",tier="barato"} 31.0
   gateway_tokens_total{tenant="free",tier="barato"} 22.0
   # HELP gateway_custo_usd_total Custo estimado em US$
   # TYPE gateway_custo_usd_total counter
   gateway_custo_usd_total{tenant="loja-a"} 9.6e-06
   gateway_custo_usd_total{tenant="free"} 4.2000000000000004e-06
```

Diferenças do JS: o `prometheus_client` escreve `# HELP`/`# TYPE`, valores em float (`1.0`, `9.6e-06`) e acrescenta
o sufixo `_total` sozinho ao nome do `Counter` (por isso ele é declarado como `gateway_requisicoes`).
