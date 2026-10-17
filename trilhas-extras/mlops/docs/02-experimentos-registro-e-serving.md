# 11 · Experimentos, registro e serving com MLflow

## Objetivo

Usar o MLflow 3 para as três primeiras etapas de MLOps: **rastrear** experimentos, **registrar e promover**
modelos e **servir** o modelo promovido.

Versões estudadas: **MLflow 3.17.1** e **scikit-learn 1.9.1** (2026-10-13).

## Os quatro conceitos

| Conceito | O que é | No código |
|---|---|---|
| **Experiment** | pasta lógica de runs sobre o mesmo problema | `mlflow.set_experiment("cancer-de-mama")` |
| **Run** | uma execução de treino: params, métricas, dados, tags | `with mlflow.start_run(): ...` |
| **LoggedModel** | o modelo salvo, com assinatura e requisitos; URI `models:/m-<id>` | `mlflow.sklearn.log_model(modelo, name="modelo", ...)` |
| **Registered model** | nome estável com **versões** numeradas e **aliases** | `mlflow.register_model(uri, "cancer-clf")` |

## Tracking

```python
mlflow.set_tracking_uri("sqlite:///mlflow.db")      # padrão desde o MLflow 3.7
mlflow.set_experiment("cancer-de-mama")
with mlflow.start_run(run_name="logreg-C1.0"):
    mlflow.log_params({"C": 1.0, "random_state": 42})
    mlflow.log_metrics({"roc_auc": 0.9977, "recall_maligno": 0.981})
    mlflow.log_input(mlflow.data.from_pandas(df_treino, name="treino", targets="target"), context="training")
    mlflow.sklearn.log_model(modelo, name="modelo", signature=infer_signature(X, pred), input_example=X.head(2))
```

- **Backend**: desde a 3.7 o padrão é SQLite (`mlflow.db`). O antigo `./mlruns` (file store) está em
  "maintenance mode" e dá erro na 3.17, a menos que você defina `MLFLOW_ALLOW_FILE_STORE=true`.
- **`name=`** substituiu `artifact_path=` (que ainda funciona, com aviso de deprecação).
- **Dataset**: `log_input` grava um *digest* (hash) dos dados no run.
- **Assinatura**: o contrato de colunas e tipos, que o serving usa para validar o payload.
- **UI**: `mlflow server --backend-store-uri sqlite:///mlflow.db --port 5000` (o `mlflow ui` virou um alias).
- **Comparar**: `mlflow.search_runs(experiment_names=[...], order_by=["metrics.roc_auc DESC"])` devolve
  um DataFrame. Use `.iloc[0]`, não `[0]`: o exemplo da própria doc tem esse erro.

## Registro e promoção

```python
versao = mlflow.register_model(logged_model.model_uri, "cancer-clf")
MlflowClient().set_registered_model_alias("cancer-clf", "champion", versao.version)
modelo = mlflow.sklearn.load_model("models:/cancer-clf@champion")
```

- **Aliases** (`champion`, `challenger`) são ponteiros móveis: promover é mover o ponteiro, e quem consome não muda código.
- **Stages** (`Staging`, `Production`, `transition_model_version_stage`) estão **deprecados desde o 2.9**.
- **MLflow 3 mudou onde o modelo mora**: ele é um LoggedModel (`models:/m-<id>`), não um artefato do run.
  `runs:/<run_id>/modelo` está deprecado; ache o modelo com `mlflow.search_logged_models(filter_string="source_run_id = '...'")`
  ou use o `model_uri` devolvido pelo `log_model`.

## Serving

```bash
MLFLOW_TRACKING_URI=sqlite:///mlflow.db \
  mlflow models serve -m "models:/cancer-clf@champion" -p 5001 --env-manager local
```

| Endpoint | Para quê |
|---|---|
| `POST /invocations` | previsões. Payload `dataframe_split`, `dataframe_records`, `inputs` ou `instances` |
| `GET /ping`, `GET /health` | prontidão |
| `GET /version` | versão do MLflow |

- `--env-manager` padrão é `virtualenv` (recria o ambiente do modelo; exige `pyenv`). Outros: `local`, `uv`, `conda`.
- Em produção no Kubernetes/OpenShift, o caminho comum é o **KServe com MLServer** ([docs/04](04-mlops-no-openshift-ai.md)),
  ou `mlflow models build-docker` para gerar uma imagem.

## Armadilhas

- Rodar o binário `.venv/bin/mlflow models serve` sem ativar o venv: o `uvicorn` não está no PATH (return code 127). Use `uv run mlflow ...`.
- Salvar modelos sklearn em pickle tem risco de segurança ao carregar arquivos de terceiros. O MLflow sugere o formato `skops`.
- Requisitos do modelo inflados: num projeto uv, o MLflow exporta **todas** as dependências do projeto. Passe `pip_requirements`.
- Um banco SQLite de outra versão do MLflow pede `mlflow db upgrade <uri>`.

## Fontes

- MLflow 3 (o que mudou): https://mlflow.org/docs/latest/ml/mlflow-3/
- Tracking: https://mlflow.org/docs/latest/ml/tracking/
- Backend store e mudança para SQLite: https://mlflow.org/docs/latest/self-hosting/architecture/backend-store/
- Datasets: https://mlflow.org/docs/latest/ml/dataset/
- Model Registry: https://mlflow.org/docs/latest/ml/model-registry/workflow/
- Serving local: https://mlflow.org/docs/latest/ml/deployment/deploy-model-locally/
- Busca de runs: https://mlflow.org/docs/latest/ml/search/search-runs/
