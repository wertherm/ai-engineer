# Runbook: container morto por falta de memória (OOMKilled)

dono: time-plataforma · revisado: 2026-09-20

## Sintoma

Alerta KubePodOOMKilled ou KubePodCrashLooping. O container reinicia com reason OOMKilled e exit code 137:
o processo passou do limits.memory e o kernel o matou.

## Diagnóstico

```bash
kubectl -n {{namespace}} get pods -l app={{app}} --no-headers
kubectl -n {{namespace}} get deploy {{app}} -o jsonpath={.spec.template.spec.containers[0].resources}
```

## Mitigação

Aumentar o limite de memória (mitigação, não correção: abra tarefa para investigar o consumo).

```bash
kubectl -n {{namespace}} set resources deploy/{{app}} --limits=memory=128Mi --requests=memory=64Mi
```

## Validação

```bash
kubectl -n {{namespace}} rollout status deploy/{{app}} --timeout=90s
```
