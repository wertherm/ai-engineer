"""Pipeline de treino reprodutível: o "nível 1" de MLOps do Google, em um script.

Etapas (cada uma é uma função; num orquestrador, cada uma vira um passo):
  1. carregar    -> dados + split com seed fixa
  2. validar     -> esquema, nulos e faixas plausíveis (dado ruim para o pipeline ANTES do treino)
  3. treinar     -> com os parâmetros do params.yaml, rastreado no MLflow
  4. avaliar     -> métricas no conjunto de teste
  5. portão      -> mínimos absolutos + "melhor que o champion atual?"
  6. registrar   -> versão nova no Model Registry; promove a champion só se passou no portão

Uso: uv run python exemplos/05-pipeline-de-treino/pipeline.py [params.yaml]
Sai com 0 (promovido ou mantido) ou 1 (dados inválidos / portão reprovado).
"""
import logging
import os
import sys
import warnings
from pathlib import Path

os.environ.setdefault("MLFLOW_DISABLE_AGENT_HINT", "1")

import mlflow
import pandas as pd
import yaml
from mlflow import MlflowClient
from mlflow.exceptions import MlflowException
from mlflow.models import infer_signature
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

logging.getLogger("mlflow").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", message="Hint: Inferred schema contains integer column")
AQUI, RAIZ = Path(__file__).parent, Path(__file__).resolve().parents[2]
mlflow.set_tracking_uri(f"sqlite:///{RAIZ / 'mlflow.db'}")
MODELO = "cancer-clf"


def carregar(cfg: dict):
    X, y = load_breast_cancer(return_X_y=True, as_frame=True)
    return train_test_split(X, y, test_size=cfg["test_size"], random_state=cfg["random_state"], stratify=y)


def validar(X: pd.DataFrame) -> list[str]:
    problemas = []
    if X.shape[1] != 30:
        problemas.append(f"esperava 30 colunas, vieram {X.shape[1]}")
    if X.isna().any().any():
        problemas.append(f"valores nulos em: {X.columns[X.isna().any()].tolist()}")
    if (X < 0).any().any():  # medidas físicas não podem ser negativas
        problemas.append(f"valores negativos em: {X.columns[(X < 0).any()].tolist()}")
    return problemas


def treinar(cfg: dict, X, y):
    return make_pipeline(StandardScaler(), LogisticRegression(C=cfg["C"], max_iter=1000)).fit(X, y)


def avaliar(modelo, X, y) -> dict:
    return {
        "recall_maligno": recall_score(y, modelo.predict(X), pos_label=0),
        "roc_auc": roc_auc_score(y, modelo.predict_proba(X)[:, 1]),
    }


def portao(metricas: dict, cfg: dict, client: MlflowClient) -> tuple[bool, str]:
    if metricas["recall_maligno"] < cfg["recall_maligno_minimo"]:
        return False, f"recall_maligno {metricas['recall_maligno']:.3f} < mínimo {cfg['recall_maligno_minimo']}"
    if metricas["roc_auc"] < cfg["roc_auc_minimo"]:
        return False, f"roc_auc {metricas['roc_auc']:.4f} < mínimo {cfg['roc_auc_minimo']}"
    try:
        champion = client.get_model_version_by_alias(MODELO, "champion")
        auc_champion = client.get_run(champion.run_id).data.metrics["roc_auc"]
    except MlflowException:
        return True, "sem champion atual"
    if metricas["roc_auc"] <= auc_champion:
        return False, f"não supera o champion v{champion.version} (roc_auc {auc_champion:.4f})"
    return True, f"supera o champion v{champion.version} ({auc_champion:.4f} -> {metricas['roc_auc']:.4f})"


def main() -> int:
    params = yaml.safe_load((Path(sys.argv[1]) if len(sys.argv) > 1 else AQUI / "params.yaml").read_text())
    client = MlflowClient()
    mlflow.set_experiment("cancer-de-mama")

    X_treino, X_teste, y_treino, y_teste = carregar(params["dados"])
    print(f"1. carregar   : {len(X_treino)} treino / {len(X_teste)} teste")

    problemas = validar(X_treino) + validar(X_teste)
    print(f"2. validar    : {'ok' if not problemas else 'REPROVADO: ' + '; '.join(problemas)}")
    if problemas:
        return 1

    with mlflow.start_run(run_name=f"pipeline-C{params['modelo']['C']}"):
        modelo = treinar(params["modelo"], X_treino, y_treino)
        print(f"3. treinar    : {params['modelo']}")

        metricas = avaliar(modelo, X_teste, y_teste)
        print(f"4. avaliar    : recall_maligno={metricas['recall_maligno']:.3f} roc_auc={metricas['roc_auc']:.4f}")
        mlflow.log_params({**params["dados"], **params["modelo"]})
        mlflow.log_metrics(metricas)
        info = mlflow.sklearn.log_model(
            modelo, name="modelo", signature=infer_signature(X_teste, modelo.predict(X_teste)), input_example=X_teste.head(2)
        )

        aprovado, motivo = portao(metricas, params["portao"], client)
        print(f"5. portão     : {'APROVADO' if aprovado else 'REPROVADO'} ({motivo})")
        if not aprovado:
            # Reprovar por não superar o champion não é erro: a versão atual continua servindo.
            return 0 if "champion" in motivo else 1

        versao = mlflow.register_model(info.model_uri, MODELO)
        client.set_registered_model_alias(MODELO, "champion", versao.version)
        print(f"6. registrar  : versão {versao.version} agora é o champion")
    return 0


if __name__ == "__main__":
    sys.exit(main())
