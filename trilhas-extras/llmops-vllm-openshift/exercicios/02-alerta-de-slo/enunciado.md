# Exercício 02 · Alerta de SLO de TTFT

**Tópicos praticados:** exemplos 03 e 04 · [docs/04](../../docs/04-metricas-e-observabilidade.md)

## Contexto

O SLO combinado com o produto é: **TTFT médio de até 1 s**. Você precisa de um verificador que possa
rodar num cron ou num pipeline de CI e que **falhe** (código de saída 1) quando o SLO for violado.

## Requisitos

1. Script `alerta.py` com o argumento obrigatório `--limite-ms` (e o opcional `--requisicoes`, padrão 3).
2. Medir o TTFT médio **de uma janela**, pelo `/metrics` do servidor (não pelo relógio do cliente):
   foto → tráfego sintético → foto → `Δsum / Δcount`.
3. Imprimir `OK: ...` ou `ALERTA: ...` e sair com código 0 ou 1.
4. Sem requisições na janela também é alerta (servidor parado de responder é pior que lento).

## Critério de pronto

```bash
uv run python alerta.py --limite-ms 2000; echo $?   # OK ... -> 0
uv run python alerta.py --limite-ms 10;   echo $?   # ALERTA ... -> 1
```

## Dicas

- O nome da métrica é `vllm:time_to_first_token_seconds` (histograma: `_sum`, `_count`, `_bucket`).
- Cuidado com a regex do nome: métricas Prometheus podem ter dígitos (`e2e`). Veja o [exemplo 04](../../exemplos/04-metricas-prometheus/).

A solução está em [`solucao/`](solucao/).
