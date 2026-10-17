# 07 · vLLM no Kubernetes e no OpenShift

**Conceito novo:** o mesmo servidor agora roda **orquestrado**: Deployment (quantas cópias e como
atualizar), Service (endereço estável), probes (quando está pronto ou travado), requests/limits
(quanta CPU e RAM). Depois, a variante **OpenShift**: Project, SCC `restricted-v2` (UID aleatório, sem
root) e Route.
**Pré-requisito:** [exemplo 01](../01-primeira-chamada/) e kind + kubectl instalados ([infra/instalacao.md](../../../../infra/instalacao.md)).
Teoria em [docs/06](../../docs/06-kubernetes-e-openshift.md) e [docs/07](../../docs/07-vllm-no-openshift.md).

```
k8s/          -> Kubernetes puro, testado no kind
openshift/    -> variante OpenShift (Deployment/Service/PVC testados no kind em modo "restricted";
                 Route e ServiceMonitor NÃO executados localmente: precisam de um OpenShift)
```

## Como rodar

```bash
bash ../../infra/parar-vllm.sh                                    # libera RAM e a porta 8000
bash exemplos/07-vllm-no-kubernetes/criar-cluster.sh          # cria o kind e copia a imagem (~2 min)
kubectl apply -f exemplos/07-vllm-no-kubernetes/k8s/
kubectl -n llmops rollout status deploy/vllm --timeout=400s   # ~2–3 min
kubectl -n llmops port-forward svc/vllm 8001:8000 &           # túnel até o Service
VLLM_URL=http://localhost:8001 uv run python exemplos/01-primeira-chamada/chamada.py
```

## Saída esperada

Saída real (2026-10-13). A resposta é **idêntica** à do Docker, porque é o mesmo modelo com `temperature=0`:

```
namespace/llmops created
deployment.apps/vllm created
service/vllm created
deployment "vllm" successfully rolled out
Um container é um sistema de software que se torna independente do hardware onde está instalado, ...
tokens: entrada=31 saída=36
motivo de parada: stop
```

## Três erros reais que este exemplo já corrige

| Sintoma | Causa raiz | Correção no manifest |
|---|---|---|
| `Error from server (NotFound): namespaces "llmops" not found` | `kubectl apply -f pasta/` aplica em ordem **alfabética**: o Deployment vinha antes do Namespace | arquivos numerados (`01-`, `02-`, `03-`) |
| Pod em `CrashLoopBackOff` com `ValueError: VLLM_PORT 'tcp://10.96.x.x:8000' appears to be a URI` | o Kubernetes injeta `<SERVICE>_PORT` em todo pod; um Service chamado `vllm` cria `VLLM_PORT`, que é uma variável do próprio vLLM | `enableServiceLinks: false` |
| Pod novo preso em `Pending` (`0/1 nodes are available: 1 Insufficient cpu`) | o RollingUpdate sobe o pod novo antes de matar o velho; num nó só, não cabem dois pods de 4 CPUs | `strategy: Recreate` |

## Simulando o OpenShift no kind

```bash
bash exemplos/07-vllm-no-kubernetes/openshift/simular-no-kind.sh
```

Saída real:

```
== 1. O manifest 'Kubernetes puro' viola a política (só aviso, porque é dry-run de Deployment):
Warning: would violate PodSecurity "restricted:latest": allowPrivilegeEscalation != false (container "vllm" must ...
== 2. O manifest adaptado ao OpenShift passa:
deployment "vllm" successfully rolled out
uid=1000850000 gid=0(root) groups=0(root),1000850000
```

Ou seja: a imagem de CPU do vLLM 0.31.0 **roda com UID arbitrário** desde que o cache do modelo
(`HF_HOME`) e o `HOME` apontem para pastas graváveis. Também é preciso tirar o `SYS_NICE` e trocar o
`hostPath` por um PVC. Um artigo da Red Hat de 2025 usava `privileged`; com a imagem atual isso não foi
necessário na simulação. **Não testado num OpenShift real**: confirme no Developer Sandbox.

## Experimente

1. `kubectl -n llmops delete pod -l app=vllm` e veja o Deployment recriar o pod sozinho.
2. Tire o `startupProbe` e aplique: o liveness mata o pod antes de ele terminar de subir.
3. No OpenShift (Sandbox): `oc apply -n "$(oc project -q)" -f openshift/` e `oc get route vllm` para pegar a URL pública. Os manifests de `openshift/` não fixam namespace porque no Sandbox o projeto já vem criado (`<usuario>-dev`).
