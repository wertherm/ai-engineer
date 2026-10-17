# 13 · MLOps no OpenShift AI

## Objetivo

Saber onde cada peça da trilha de MLOps local vive no **Red Hat OpenShift AI 3.5**, para levar o que
você fez aqui para um cluster.

## O mapa

| Na trilha (local) | No OpenShift AI 3.5 | Status no 3.5 |
|---|---|---|
| MLflow com SQLite ([ex. 01](../exemplos/01-experimentos-com-mlflow/)) | **MLflow gerenciado** pelo operador; 1 workspace por projeto | GA desde o 3.4 |
| Model Registry do MLflow ([ex. 02](../exemplos/02-registro-e-promocao/)) | MLflow registry **ou** o **Model Registry** do OpenShift AI (upstream `kubeflow/hub`) | Model Registry habilitado por padrão em instalação nova |
| `mlflow models serve` ([ex. 03](../exemplos/03-servindo-o-modelo/)) | **KServe** com o runtime **MLServer** (sklearn, XGBoost, LightGBM, ONNX) | MLServer em **Technology Preview** |
| Script de drift ([ex. 04](../exemplos/04-drift-e-monitoramento/)) | um Job/CronJob seu (ou o monitoramento do TrustyAI, se disponível na sua versão) | não verificado nesta pesquisa |
| `pipeline.py` / `pipeline_kfp.py` ([ex. 05](../exemplos/05-pipeline-de-treino/)) | **AI Pipelines** (antes "Data Science Pipelines"), baseado em Kubeflow Pipelines 2 | doc do 3.5 não marca como preview |

## MLflow gerenciado

Desde o 3.4, o MLflow é um componente gerenciado do `DataScienceCluster`. No 3.5, o tracking vem embutido
em workbenches, AI Pipelines e jobs de treino: runs são registrados sozinhos no MLflow do projeto.

```bash
# cluster-admin habilita
oc patch datasciencecluster default-dsc --type=merge \
  -p '{"spec":{"components":{"mlflowoperator":{"managementState":"Managed"}}}}'

# no seu código, só mudam as variáveis de ambiente (SDK >= 3.11: pip install "mlflow[kubernetes]>=3.11")
export MLFLOW_TRACKING_URI="https://<url-do-dashboard>/mlflow"
export MLFLOW_TRACKING_AUTH=kubernetes-namespaced
```

Cada **projeto** do OpenShift é um **workspace** do MLflow (experimentos e modelos isolados), com
permissão pelo RBAC do Kubernetes. Em produção: PostgreSQL + S3; em desenvolvimento: SQLite + disco. O
código dos exemplos 01 e 09 roda igual, trocando só o `MLFLOW_TRACKING_URI`.

## AI Pipelines (Kubeflow Pipelines v2)

1. Escreva componentes com `@dsl.component` e o pipeline com `@dsl.pipeline` (`pipeline_kfp.py`).
2. Compile: `compiler.Compiler().compile(pipeline, "pipeline_kfp.yaml")` (SDK `kfp` 2.17).
3. No dashboard: **Pipelines → Import pipeline → Create run**, preenchendo os parâmetros (`C`, `recall_minimo`).

Cada componente roda **no seu próprio container** (`base_image` + `packages_to_install`); artefatos
(`Dataset`, `Model`, `Metrics`) trafegam entre os passos pelo armazenamento S3 configurado no servidor de
pipelines. O `dsl.If` vira um ramo condicional do grafo: é o portão de promoção.

Novidade do 3.5: a extensão **Kale** do JupyterLab converte um notebook em pipeline (vem desabilitada).

## Servindo um modelo scikit-learn no KServe

O runtime para modelos clássicos é o **MLServer ServingRuntime for KServe** (Technology Preview no 3.5):

- o arquivo do modelo deve se chamar `model.joblib`, `model.pkl` ou `model.pickle`, em `/mnt/models`
  (ou indique outro com a variável `MLSERVER_MODEL_URI`);
- protocolo **Open Inference Protocol v2**: `POST /v2/models/<nome>/infer`;
- pelo dashboard: *Model type* = Predictive, *Framework* = Scikit-learn.

Exemplo do KServe upstream (no OpenShift AI, troque o `runtime` pelo nome do ServingRuntime MLServer do
seu projeto, que você vê com `oc get servingruntimes`):

```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: cancer-clf
spec:
  predictor:
    model:
      modelFormat: {name: sklearn}
      protocolVersion: v2
      runtime: <servingruntime-mlserver-do-projeto>
      storageUri: s3://<bucket>/cancer-clf/   # contém model.joblib
```

**Não executado localmente**: exige um cluster com OpenShift AI.

## Armadilhas

- Tutoriais de "Data Science Pipelines v1" (KFP 1.x, Argo/Tekton): o 3.x usa KFP 2.
- Exportar o modelo com o nome errado: o MLServer procura `model.joblib`/`model.pkl` na raiz do `storageUri`.
- Esquecer que cada componente KFP roda isolado: imports e pacotes precisam estar **dentro** da função ou no `packages_to_install`.
- Contar com Technology Preview em produção: sem SLA de suporte.

## Fontes

- MLflow no OpenShift AI 3.5: https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/working_with_mlflow/index
- AI Pipelines 3.5: https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/working_with_ai_pipelines/index
- Deploy de modelos 3.5 (MLServer): https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/deploying_models/index
- Model Registry 3.5: https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/working_with_model_registries/index
- Kubeflow Pipelines, primeiros passos: https://www.kubeflow.org/docs/components/pipelines/getting-started/
- KServe, sklearn: https://kserve.github.io/website/docs/model-serving/predictive-inference/frameworks/sklearn
- Kubeflow Hub (Model Registry upstream): https://github.com/kubeflow/hub
