# Exemplo 02 · Agente de deploy end-to-end no kind (readiness + rollback)

**Conceito novo**: o LLM **preenche um formulário** (JSON com nome, imagem, réplicas, porta, máx. réplicas,
% de CPU) e o código renderiza Deployment + Service + HPA de um template com as boas práticas embutidas.
Depois vêm os portões: validação do formulário → `kubectl apply --dry-run=server` → `apply` →
`rollout status` (espera a **readinessProbe**) → `rollout undo` automático se a versão nova não ficar pronta.
A release 2 troca a tag por uma inexistente (sem LLM) para provar o rollback.

Teoria: [doc 03](../../docs/03-kubernetes-troubleshooting-e-aiops.md#manifests-a-partir-de-linguagem-natural).

**Pré-requisito**: [exemplo 01](../01-iac-copilot-terraform/) (o padrão propor → validar) e o cluster kind
`estudo` no ar (`docker start estudo-control-plane`; contexto `kind-estudo`). A imagem
`nginxinc/nginx-unprivileged:1.31.6-alpine` já está no nó (`imagePullPolicy: IfNotPresent`).

## Arquivos

| Arquivo | Papel |
|---|---|
| `manifests.js` | `validarSpec` (regras da plataforma) e `renderizar` (template com probes, requests/limits, `runAsNonRoot`, `progressDeadlineSeconds: 60`) |
| `main.js` | extração da spec pelo LLM (com 1 correção), portões, rollback e limpeza do namespace `m06-deploy` |

## Como rodar

```bash
cd modulos/06-ia-devops
npm run ex02
node exemplos/02-agente-de-deploy-kind/main.js "Publique o serviço api com a imagem nginxinc/nginx-unprivileged:1.31.6-alpine, 1 réplica, porta 8080, até 3 réplicas com 60% de CPU" --manter
```

`--manter` deixa o namespace para você inspecionar (`kubectl --context kind-estudo -n m06-deploy get all,hpa`);
apague depois com `npm run limpar:k8s`.

## Saída esperada

```
Pedido: Publique o serviço vitrine com a imagem nginxinc/nginx-unprivileged:1.31.6-alpine, 2 réplicas, porta 8080, escalando até 4 réplicas quando a CPU passar de 70%.

[llm      ] tentativa 1, 348.8s: {"nome":"vitrine","imagem":"nginxinc/nginx-unprivileged:1.31.6-alpine","replicas":2,"porta":8080,"maxReplicas":4,"cpuAlvo":70}

== Release 1: versão pedida ==
[validação] ✓ spec ok (release 1)
[dry-run  ] ✓ deployment.apps/vitrine created (server dry run) · service/vitrine created (server dry run) · horizontalpodautoscaler.autoscaling/vitrine created (server dry run)
[apply    ] deployment.apps/vitrine created · service/vitrine created · horizontalpodautoscaler.autoscaling/vitrine created
[readiness] ✓ pronto em 2s
[hpa      ] vitrine   Deployment/vitrine   cpu: <unknown>/70%   2     4     2     2s

== Release 2: tag inexistente (falha proposital) ==
[validação] ✓ spec ok (release 2)
[dry-run  ] ✓ deployment.apps/vitrine configured (server dry run) · service/vitrine unchanged (server dry run) · horizontalpodautoscaler.autoscaling/vitrine unchanged (server dry run)
[apply    ] deployment.apps/vitrine configured · service/vitrine unchanged · horizontalpodautoscaler.autoscaling/vitrine unchanged
[readiness] ✗ não ficou pronto em 60s: error: deployment "vitrine" exceeded its progress deadline
[evidência] vitrine-79d49f668c-f9ljl   <none> | vitrine-79d49f668c-rqqzj   <none> | vitrine-ff7df4745-jxpmp    ErrImagePull
[rollback ] deployment.apps/vitrine rolled back
[rollback ] ✓ versão anterior servindo de novo
[estado   ] release 2 revertida; imagem em produção: nginxinc/nginx-unprivileged:1.31.6-alpine
[limpeza  ] namespace m06-deploy removido (use --manter para inspecionar)

1 chamadas ao LLM · 171 tokens de prompt · 49 de resposta · 348.8s no modelo
```

### Antes do few-shot (execução anterior, também real)

Sem o exemplo de saída no prompt, o `qwen3.5:4b` embrulhou a imagem em `< >` e, ao receber o erro, piorou
(`<img src=...>`). A validação do formulário barrou as duas e o agente escalou, sem tocar no cluster:

```
[llm      ] tentativa 1, 363.9s: { "nome": "vitrine", "imagem": "<nginxinc/nginx-unprivileged:1.31.6-alpine>", "replicas": 2, ... }
[validação] ✗ imagem "<nginxinc/nginx-unprivileged:1.31.6-alpine>" precisa de tag explícita
[llm      ] tentativa 2, 376.5s: { "nome": "vitrine", "imagem": "<img src=\"nginxinc/nginx-unprivileged:1.31.6-alpine\">", ... }
[validação] ✗ imagem "<img src="nginxinc/nginx-unprivileged:1.31.6-alpine">" precisa de tag explícita
[fim      ] spec continua inválida: escalar para um humano
```

O HPA aparece com `cpu: <unknown>/70%`: o kind deste repo não tem metrics-server (ver doc 03).

## Experimente

1. Peça a imagem com `:latest` ou porta 80: a validação do formulário reprova antes de chegar ao cluster.
2. Mude `progressDeadlineSeconds` para 600 em `manifests.js` e veja o rollout da release 2 esperar muito mais.
3. Troque `maxUnavailable: 0` por `1` e observe que, durante a release quebrada, o serviço perde capacidade.
