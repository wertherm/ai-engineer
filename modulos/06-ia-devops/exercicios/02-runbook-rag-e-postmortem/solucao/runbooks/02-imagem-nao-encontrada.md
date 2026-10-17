# Runbook: imagem não encontrada (ImagePullBackOff)

dono: time-plataforma · revisado: 2026-08-02

## Sintoma

Pods presos em ImagePullBackOff ou ErrImagePull logo após um deploy. Mensagem "not found" indica tag
errada; "unauthorized" indica credencial do registry.

## Diagnóstico

```bash
kubectl -n {{namespace}} get pods -l app={{app}} --no-headers
```

## Mitigação

Voltar para a revisão anterior do Deployment (a tag que funcionava).

```bash
kubectl -n {{namespace}} rollout undo deploy/{{app}}
```

## Validação

```bash
kubectl -n {{namespace}} rollout status deploy/{{app}} --timeout=90s
```
