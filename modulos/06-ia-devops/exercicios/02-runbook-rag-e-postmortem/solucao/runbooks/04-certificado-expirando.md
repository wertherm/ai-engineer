# Runbook: certificado TLS perto de expirar

dono: time-seguranca · revisado: 2026-06-30

## Sintoma

Alerta CertificateExpiringSoon: certificado do Ingress expira em menos de 14 dias. O cert-manager não
renovou (desafio ACME falhando ou issuer com problema).

## Diagnóstico

```bash
kubectl -n {{namespace}} get certificate
```

## Mitigação

Forçar a renovação apagando o Secret do certificado (o cert-manager recria). Exige aprovação do time de segurança.

```bash
kubectl -n {{namespace}} delete secret {{app}}-tls
```

## Validação

```bash
kubectl -n {{namespace}} get certificate
```
