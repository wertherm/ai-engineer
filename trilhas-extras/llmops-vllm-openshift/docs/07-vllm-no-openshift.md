# 08 · vLLM no OpenShift: do Deployment ao OpenShift AI

## Objetivo

Conhecer os três jeitos de servir um LLM no OpenShift, do mais manual ao mais gerenciado, e saber qual
escolher.

## Os três caminhos

| Caminho | O que você escreve | Quando usar |
|---|---|---|
| **1. Deployment + Service + Route** | YAML do Kubernetes, como no [exemplo 07](../exemplos/07-vllm-no-kubernetes/openshift/) | aprender; cluster sem OpenShift AI; controle total |
| **2. OpenShift AI (KServe)** | `ServingRuntime` + `InferenceService` | padrão em produção: escala, dashboard, registro de modelos |
| **3. llm-d** (OpenShift AI 3.5) | `LLMInferenceService` | modelos grandes em vários nós e GPUs, roteamento ciente de KV cache |

## Caminho 1: manual (este repo)

Já está pronto em `exemplos/07-vllm-no-kubernetes/openshift/`. Num OpenShift de verdade:

```bash
oc login --token=... --server=...           # copie o comando do console: "Copy login command"
oc apply -n "$(oc project -q)" -f exemplos/07-vllm-no-kubernetes/openshift/
oc rollout status deploy/vllm
curl -s "https://$(oc get route vllm -o jsonpath='{.spec.host}')/v1/models"
```

**Não executado localmente.** A parte Kubernetes desses manifests foi validada no kind em modo
`restricted` com UID aleatório; Route e ServiceMonitor precisam de um OpenShift.

## Caminho 2: OpenShift AI com KServe

O **Red Hat OpenShift AI** (versão atual: 3.5) instala o KServe. Você declara **com que runtime** servir e
**qual modelo**; o operador cria Deployment, Service, Route, métricas e autoscaling. Trecho baseado na doc
oficial do 3.5 (resumido):

```yaml
apiVersion: serving.kserve.io/v1alpha1
kind: ServingRuntime
metadata:
  name: vllm-runtime
spec:
  annotations: {prometheus.io/path: /metrics, prometheus.io/port: "8080"}
  containers:
    - name: kserve-container
      image: <imagem do vLLM fornecida pelo OpenShift AI / Red Hat AI Inference Server>
      command: [python, -m, vllm.entrypoints.openai.api_server]
      args: [--port=8080, --model=/mnt/models, --served-model-name={{.Name}}]
      ports: [{containerPort: 8080, protocol: TCP}]
  supportedModelFormats: [{name: vLLM, autoSelect: true}]
---
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: granite
spec:
  predictor:
    minReplicas: 1
    model:
      modelFormat: {name: vLLM}
      runtime: vllm-runtime
      storage: {key: aws-connection-my-storage, path: models/granite-7b-instruct/}
      resources:
        requests: {cpu: "1", memory: 8Gi, nvidia.com/gpu: "1"}
        limits: {cpu: "6", memory: 24Gi, nvidia.com/gpu: "1"}
```

Pontos de atenção (OpenShift AI 3.x):

- O modo **KServe Serverless** (Knative) e o **ModelMesh** foram deprecados no 2.25; o padrão é o
  **RawDeployment** ("standard"). Tutoriais antigos com Knative não valem mais.
- O modelo vem de um *data connection* (S3), de um PVC ou de uma imagem OCI, montado em `/mnt/models`.
- O **Red Hat AI Inference Server** é o vLLM empacotado e suportado pela Red Hat
  (`registry.redhat.io/rhaiis/vllm-<acelerador>-rhel9`).

## Caminho 3: llm-d

O **llm-d** (CNCF Sandbox; Red Hat, Google, IBM, NVIDIA e outros) roda vLLM distribuído: agendador que
manda a requisição para a réplica que **já tem o prefixo no KV cache**, separação entre réplicas de
*prefill* e de *decode* e *expert parallelism* para modelos MoE. É GA no OpenShift AI 3.5. Só faz sentido
com várias GPUs; para estudar, entenda o conceito e siga com os caminhos 1 e 2.

## Monitoramento no OpenShift

1. O cluster-admin liga o *user workload monitoring*:
   ```yaml
   # oc -n openshift-monitoring edit configmap cluster-monitoring-config
   data:
     config.yaml: |
       enableUserWorkload: true
   ```
2. Você cria o `ServiceMonitor` (`openshift/05-servicemonitor.yaml`) no mesmo namespace do Service.
3. Consulta as métricas `vllm:*` em **Observe → Metrics** no console, com o mesmo PromQL de [docs/04](04-metricas-e-observabilidade.md).

## Armadilhas

- Copiar YAML de tutorial do OpenShift AI 2.x (Serverless/Knative) num cluster 3.x.
- Usar o *display name* do runtime no `runtime:` do InferenceService em vez do `metadata.name`.
- Esquecer o timeout da Route: inferência longa estoura o timeout padrão do roteador (costuma ser 30 s).
- Pôr o token do Hugging Face direto no YAML: use um `Secret`.

## Fontes

- OpenShift AI 3.5, release notes: https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/release_notes/new-features-and-enhancements_relnotes
- OpenShift AI 3.5, model serving (PDF): https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/pdf/configuring_your_model-serving_platform/Red_Hat_OpenShift_AI_Self-Managed-3.5-Configuring_your_model-serving_platform-en-US.pdf
- Red Hat AI Inference Server: https://docs.redhat.com/en/documentation/red_hat_ai_inference_server/3.2/html-single/release_notes/index
- llm-d: https://llm-d.ai/ e https://developers.redhat.com/articles/2025/11/21/introduction-distributed-inference-llm-d
- vLLM em CPU no OpenShift (Red Hat, 2025): https://developers.redhat.com/articles/2025/06/17/how-run-vllm-cpus-openshift-gpu-free-inference
- User workload monitoring 4.22 (PDF): https://docs.redhat.com/en/documentation/monitoring_stack_for_red_hat_openshift/4.22/pdf/configuring_user_workload_monitoring/Monitoring_stack_for_Red_Hat_OpenShift-4.22-Configuring_user_workload_monitoring-en-US.pdf
