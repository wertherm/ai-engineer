# Runbook: latência p95 alta com CPU saturada

dono: time-checkout · revisado: 2026-07-15

## Sintoma

Alerta HighLatencyP95: p95 acima do SLO por 10 minutos, CPU dos pods perto do limite, sem erros 5xx.
Típico de pico de tráfego maior que a capacidade.

## Diagnóstico

```bash
kubectl -n {{namespace}} get hpa {{app}}
kubectl -n {{namespace}} get pods -l app={{app}} --no-headers
```

## Mitigação

Escalar horizontalmente (o HPA deveria ter feito; verifique depois por que não fez).

```bash
kubectl -n {{namespace}} scale deploy/{{app}} --replicas=4
```

## Validação

```bash
kubectl -n {{namespace}} rollout status deploy/{{app}} --timeout=90s
```
