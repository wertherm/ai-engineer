# 08 · Experimentos rastreados com MLflow

**Conceito novo:** **tracking de experimentos**. Cada treino vira um *run* com parâmetros, métricas,
a versão dos dados (digest) e o próprio modelo, com assinatura de entrada e saída. Comparar runs vira
uma consulta.
**Pré-requisito:** nenhum (abre a trilha de MLOps; não precisa do vLLM). Teoria em [docs/01](../../docs/01-mlops-fundamentos.md) e [docs/02](../../docs/02-experimentos-registro-e-serving.md).

## Como rodar

```bash
uv run python exemplos/01-experimentos-com-mlflow/treinar.py
uv run mlflow server --backend-store-uri sqlite:///mlflow.db --port 5000   # UI em http://localhost:5000
```

## Saída esperada

Saída real (2026-10-13, MLflow 3.17.1, scikit-learn 1.9.1). Com `random_state=42` os números se repetem:

```
C=0.01  accuracy=0.937 f1=0.952 recall_maligno=0.849 roc_auc=0.9952
C=0.1   accuracy=0.979 f1=0.983 recall_maligno=0.962 roc_auc=0.9971
C=1.0   accuracy=0.986 f1=0.989 recall_maligno=0.981 roc_auc=0.9977
Top 3 por roc_auc:
tags.mlflow.runName params.C  metrics.roc_auc  metrics.recall_maligno
        logreg-C1.0      1.0         0.997694                0.981132
        logreg-C0.1      0.1         0.997065                0.962264
       logreg-C0.01     0.01         0.995178                0.849057
```

Também aparecem 3 avisos `Failed to resolve installed pip version`. São inofensivos: o venv do uv não traz `pip`.

O que observar:
- **Regularização forte demais** (`C=0.01`) deixou passar 15% dos tumores malignos (recall 0,849), com acurácia ainda "boa" (0,937).
- O run guarda o **digest do dataset** (`81e5769c`): se os dados mudarem, o digest muda e você sabe que o modelo foi treinado com outra coisa.
- **MLflow 3 detecta o projeto uv** e grava como requisitos do modelo as ~100 dependências do repositório inteiro. Em produção, passe `pip_requirements=[...]` só com o necessário.

## Experimente

1. Abra a UI, selecione os 3 runs e use **Compare**.
2. Troque `LogisticRegression` por `mlflow.sklearn.autolog()` + treino puro e veja o que o MLflow registra sozinho.
3. Mude `random_state` para 7: as métricas mudam. Por isso a seed é um parâmetro logado.
