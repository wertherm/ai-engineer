# 07 · Kubernetes e OpenShift para quem vem do Docker

## Objetivo

Entender os objetos do Kubernetes que servem um modelo e o que o **OpenShift** muda: Project, Route, SCC,
builds e Operators.

## Do `docker run` ao Kubernetes

| No Docker você faz | No Kubernetes vira | Arquivo do exemplo 07 |
|---|---|---|
| `docker run -d imagem args` | **Deployment** (quantas cópias, qual imagem, como atualizar) | `k8s/02-deployment.yaml` |
| `-p 8000:8000` | **Service** (nome e IP estáveis dentro do cluster) | `k8s/03-service.yaml` |
| acesso externo | **Ingress**, ou **Route** no OpenShift | `openshift/04-route.yaml` |
| `-v ~/.cache:/root/.cache` | **volume**: `hostPath` (só em laboratório) ou **PVC** | `openshift/01-pvc.yaml` |
| `--shm-size=4g` | volume `emptyDir` com `medium: Memory` em `/dev/shm` | os dois Deployments |
| `curl /health` à mão | **probes**: `startupProbe`, `readinessProbe`, `livenessProbe` | os dois Deployments |
| "a máquina tem 15 GB" | **requests/limits** de CPU e memória | os dois Deployments |

Três probes, três perguntas:

- **startup**: "já terminou de subir?" Evita que o liveness mate o vLLM durante os ~2 min de carga.
- **readiness**: "pode receber tráfego?" Se falhar, o pod sai do Service, mas não é reiniciado.
- **liveness**: "travou?" Se falhar, o pod é reiniciado.

## O que o OpenShift acrescenta

**Project = Namespace + metadados.** `oc new-project demo` cria o namespace com permissões e cotas do
template. Prefixos `openshift-` e `kube-` são reservados. No Developer Sandbox o projeto já vem criado e
não se cria outro.

**Route em vez de Ingress.** Objeto `route.openshift.io/v1` servido pelo roteador HAProxy, com TLS
`edge` (o roteador termina o HTTPS), `passthrough` ou `reencrypt`. O OpenShift também converte Ingress em
Route. O timeout padrão do roteador é curto (costuma ser 30 s; a doc 4.22 não cita o valor). Para LLM em CPU, aumente com a anotação
`haproxy.router.openshift.io/timeout`.

**SCC `restricted-v2`: a maior diferença na prática.** Todo pod de usuário comum roda com:

- **UID aleatório** da faixa do projeto (ex.: `1000850000`) e **grupo 0**. Não é root, e não é o UID da imagem;
- todas as *capabilities* removidas, sem escalar privilégio, seccomp `RuntimeDefault`.

Por isso imagens que assumem root quebram. Erro real do [exercício 03](../exercicios/03-imagem-sem-root/):

```
nginx: [emerg] mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)
```

Como resolver, na ordem de preferência:

1. usar uma imagem feita para isso (ex.: `nginxinc/nginx-unprivileged`);
2. ajustar a imagem: `RUN chgrp -R 0 /pasta && chmod -R g=u /pasta`, porta > 1024;
3. apontar caches para pastas graváveis (`HOME=/tmp`, `HF_HOME` num volume), como o vLLM no exemplo 07;
4. **só em laboratório**: `oc adm policy add-scc-to-user anyuid -z default`.

**Builds e imagens.** `BuildConfig` + `ImageStream` + **S2I** (source-to-image) constroem a imagem a
partir do Git dentro do cluster (`oc new-app https://github.com/sclorg/cakephp-ex`). O caminho novo é o
*Builds for Red Hat OpenShift* (Shipwright). O `DeploymentConfig` está **deprecado desde a 4.14**: use `Deployment`.

**Operators.** Aplicações que se instalam e se operam sozinhas (o OpenShift AI é um). Desde a 4.20, o
console reúne OperatorHub e Developer Catalog no **Software Catalog**.

**Console web e monitoramento** já vêm prontos. O monitoramento de aplicações de usuário (*user workload
monitoring*) é ligado pelo cluster-admin e coleta métricas via **ServiceMonitor**.

## Simular o OpenShift no kind

O kind não tem SCC, mas tem **Pod Security Admission**. O modo `restricted` + um UID forçado reproduz as
duas regras que mais quebram imagens:

```bash
kubectl label ns llmops pod-security.kubernetes.io/enforce=restricted
kubectl -n llmops patch deploy vllm --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/securityContext","value":{"runAsUser":1000850000,"runAsGroup":0,"fsGroup":1000850000}}]'
```

É uma aproximação: Route, SCC, Projects e ServiceMonitor só existem num OpenShift de verdade.

## Armadilhas

- `kubectl apply -f pasta/` aplica em **ordem alfabética**: numere os arquivos (`01-namespace.yaml`).
- Service com o mesmo nome do app injeta `<NOME>_PORT` nos pods. Com o vLLM isso derruba o boot; use `enableServiceLinks: false`.
- `RollingUpdate` num nó só com pod pesado: o novo fica `Pending`. Use `Recreate` ou tenha folga.
- Fixar `runAsUser` no manifest dá `must be in the ranges: [1000850000, 1000859999]` no OpenShift.
- ServiceMonitor apontando para o **número** da porta, e não para o **nome**.
- Tutoriais antigos com `DeploymentConfig`, KServe Serverless e ModelMesh: saíram no OpenShift AI 3.x.

## Fontes

- Projects: https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/building_applications/projects
- Routes: https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/ingress_and_load_balancing/routes
- SCC: https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/authentication_and_authorization/managing-pod-security-policies
- Guia de imagens (UID arbitrário): https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/images/creating-images
- Pod Security Standards: https://kubernetes.io/docs/concepts/security/pod-security-standards/
- Service links: https://kubernetes.io/docs/tutorials/services/connect-applications-service/#environment-variables
- Variáveis do vLLM (aviso sobre `VLLM_PORT`): https://docs.vllm.ai/en/latest/configuration/env_vars.html
