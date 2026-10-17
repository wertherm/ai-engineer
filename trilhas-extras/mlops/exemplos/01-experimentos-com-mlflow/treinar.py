"""Experimentos rastreados: cada treino vira um "run" com parâmetros, métricas, dados e modelo.

Sem tracking, a pergunta "qual configuração gerou o modelo que está em produção?" não tem resposta.
Com o MLflow, cada run guarda: parâmetros, métricas, a versão (digest) dos dados e o próprio modelo.

Uso: uv run python exemplos/01-experimentos-com-mlflow/treinar.py
UI:  uv run mlflow ui --backend-store-uri sqlite:///mlflow.db   (http://localhost:5000)
"""
import os
from pathlib import Path

os.environ.setdefault("MLFLOW_DISABLE_AGENT_HINT", "1")  # silencia uma dica que o MLflow imprime para agentes de IA

import logging
import warnings

import mlflow
from mlflow.models import infer_signature
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

logging.getLogger("mlflow").setLevel(logging.WARNING)  # menos ruído; avisos continuam aparecendo
# O alvo (0/1) é inteiro; o MLflow avisa que inteiros não aceitam valores ausentes na inferência.
# Não se aplica ao alvo, então silenciamos só esse aviso.
warnings.filterwarnings("ignore", message="Hint: Inferred schema contains integer column")
RAIZ = Path(__file__).resolve().parents[2]
mlflow.set_tracking_uri(f"sqlite:///{RAIZ / 'mlflow.db'}")  # banco local: o Model Registry (ex. 02) exige um banco
EXPERIMENTO = "cancer-de-mama"
if mlflow.get_experiment_by_name(EXPERIMENTO) is None:
    mlflow.create_experiment(EXPERIMENTO, artifact_location=(RAIZ / "mlartifacts").as_uri())
mlflow.set_experiment(EXPERIMENTO)

# Dados: 569 exames, 30 medidas numéricas, alvo 0 = maligno, 1 = benigno.
X, y = load_breast_cancer(return_X_y=True, as_frame=True)
X_treino, X_teste, y_treino, y_teste = train_test_split(
    X, y, test_size=0.25, random_state=42, stratify=y  # seed fixa + estratificação = split reprodutível
)
# "Versão" dos dados: o MLflow calcula um digest (hash) do dataset; se os dados mudarem, o digest muda.
dados_treino = mlflow.data.from_pandas(X_treino.assign(target=y_treino), name="breast-cancer-treino", targets="target")

for C in (0.01, 0.1, 1.0):  # C = inverso da regularização: menor C, modelo mais "simples"
    with mlflow.start_run(run_name=f"logreg-C{C}"):
        modelo = make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=1000))
        modelo.fit(X_treino, y_treino)

        pred = modelo.predict(X_teste)
        prob = modelo.predict_proba(X_teste)[:, 1]
        metricas = {
            "accuracy": accuracy_score(y_teste, pred),
            "f1": f1_score(y_teste, pred),
            "recall_maligno": recall_score(y_teste, pred, pos_label=0),  # dos malignos, quantos pegamos
            "roc_auc": roc_auc_score(y_teste, prob),
        }

        mlflow.log_params({"modelo": "LogisticRegression", "C": C, "test_size": 0.25, "random_state": 42})
        mlflow.log_metrics(metricas)
        mlflow.log_input(dados_treino, context="training")
        # Assinatura = contrato de entrada/saída do modelo; quem for servir valida o payload contra ela.
        mlflow.sklearn.log_model(
            modelo, name="modelo", signature=infer_signature(X_teste, pred), input_example=X_teste.head(2)
        )
        print(f"C={C:<5} accuracy={metricas['accuracy']:.3f} f1={metricas['f1']:.3f} "
              f"recall_maligno={metricas['recall_maligno']:.3f} roc_auc={metricas['roc_auc']:.4f}")

# Comparar runs é uma consulta, não uma planilha manual.
runs = mlflow.search_runs(experiment_names=[EXPERIMENTO], order_by=["metrics.roc_auc DESC"], max_results=3)
print("\nTop 3 por roc_auc:")
print(runs[["tags.mlflow.runName", "params.C", "metrics.roc_auc", "metrics.recall_maligno"]].to_string(index=False))
