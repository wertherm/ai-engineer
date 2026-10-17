"""Solução do exercício 01: comparar algoritmos e escolher pela métrica que importa para o negócio.

Em triagem de câncer, o erro caro é o falso negativo (dizer "benigno" para um maligno).
Regra de escolha: maior recall_maligno; empate -> maior roc_auc. Acurácia só como referência.
"""
import logging
import os
import warnings
from pathlib import Path

os.environ.setdefault("MLFLOW_DISABLE_AGENT_HINT", "1")

import mlflow
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

logging.getLogger("mlflow").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", message="Hint: Inferred schema contains integer column")
mlflow.set_tracking_uri(f"sqlite:///{Path(__file__).resolve().parents[3] / 'mlflow.db'}")
mlflow.set_experiment("exercicio-04-comparacao")

X, y = load_breast_cancer(return_X_y=True, as_frame=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

candidatos = {
    "logreg": make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000)),
    "random-forest": RandomForestClassifier(n_estimators=300, random_state=42),
    "knn": make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=7)),
}

for nome, modelo in candidatos.items():
    with mlflow.start_run(run_name=nome):
        modelo.fit(X_tr, y_tr)
        pred = modelo.predict(X_te)
        mlflow.log_param("algoritmo", nome)
        mlflow.log_metrics({
            "accuracy": accuracy_score(y_te, pred),
            "recall_maligno": recall_score(y_te, pred, pos_label=0),
            "roc_auc": roc_auc_score(y_te, modelo.predict_proba(X_te)[:, 1]),
        })

runs = mlflow.search_runs(
    experiment_names=["exercicio-04-comparacao"],
    order_by=["metrics.recall_maligno DESC", "metrics.roc_auc DESC"],
)
ultimos = runs.drop_duplicates("tags.mlflow.runName")  # uma linha por algoritmo (o script pode ter rodado mais de uma vez)
tabela = ultimos[["tags.mlflow.runName", "metrics.recall_maligno", "metrics.roc_auc", "metrics.accuracy"]]
print(tabela.to_string(index=False))
print(f"\nescolhido: {ultimos.iloc[0]['tags.mlflow.runName']} (maior recall de malignos; desempate por roc_auc)")
