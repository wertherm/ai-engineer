# Trilha extra · MLOps com MLflow e Kubeflow

Ciclo de vida de um modelo clássico (classificador de câncer de mama, scikit-learn): rastrear, registrar,
servir, monitorar drift e automatizar o treino num pipeline com portão, até o formato do OpenShift AI.
Complementa os módulos 8, 9 e 10 da pós. **Não precisa do vLLM nem do Ollama.**

> **Todos os comandos desta trilha partem desta pasta** (`trilhas-extras/mlops/`). O MLflow grava em
> `mlflow.db` e `mlartifacts/` aqui mesmo (ignorados pelo git).

## Versão estudada

MLflow 3.17.1 · scikit-learn 1.9.1 · Kubeflow Pipelines SDK (`kfp`) 2.17.0 · scipy 1.18 · Python 3.14. Verificado em 2026-10-14.

## Trilha

| # | Tópico | Doc | Exemplo | Exercício |
|---|---|---|---|---|
| 1 | Fundamentos e níveis de maturidade | [01-mlops-fundamentos](docs/01-mlops-fundamentos.md) | — | — |
| 2 | Experimentos rastreados | [02-experimentos-registro-e-serving](docs/02-experimentos-registro-e-serving.md) | [01-experimentos-com-mlflow](exemplos/01-experimentos-com-mlflow/) | [01-escolher-a-metrica](exercicios/01-escolher-a-metrica/) |
| 3 | Registro, aliases e champion/challenger | [02-experimentos-registro-e-serving](docs/02-experimentos-registro-e-serving.md) | [02-registro-e-promocao](exemplos/02-registro-e-promocao/) | — |
| 4 | Servindo o modelo | [02-experimentos-registro-e-serving](docs/02-experimentos-registro-e-serving.md) | [03-servindo-o-modelo](exemplos/03-servindo-o-modelo/) | — |
| 5 | Drift e monitoramento | [03-monitoramento-e-drift](docs/03-monitoramento-e-drift.md) | [04-drift-e-monitoramento](exemplos/04-drift-e-monitoramento/) | [02-alerta-de-drift](exercicios/02-alerta-de-drift/) |
| 6 | Pipeline reprodutível + Kubeflow | [04-mlops-no-openshift-ai](docs/04-mlops-no-openshift-ai.md) | [05-pipeline-de-treino](exemplos/05-pipeline-de-treino/) | — |

## Como rodar

```bash
cd trilhas-extras/mlops
uv run python exemplos/01-experimentos-com-mlflow/treinar.py
uv run python exemplos/02-registro-e-promocao/promover.py
uv run mlflow server --backend-store-uri sqlite:///mlflow.db --port 5000   # UI em http://localhost:5000
```

## Status de verificação

| Item | Status |
|---|---|
| Exemplos 01–04 e exercícios 01–02 | ✅ executados (métricas se repetem: `random_state=42`) |
| Exemplo 05 | ✅ `pipeline.py` nos três caminhos; `pipeline_kfp.py` compilado e executado com `kfp.local` |
| Execução num cluster OpenShift AI | ⚠️ não executado localmente |
