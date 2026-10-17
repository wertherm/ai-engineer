"""Model Registry: versões numeradas de um modelo + aliases que dizem qual está em produção.

Fluxo champion/challenger:
  1. o melhor run do experimento vira uma VERSÃO nova do modelo registrado;
  2. ela só ganha o alias "champion" se for melhor que o champion atual;
  3. quem consome o modelo pede "models:/cancer-clf@champion" e nunca um número de versão.
Os antigos "stages" (Staging/Production) estão deprecados: use aliases.

Uso: uv run python exemplos/02-registro-e-promocao/promover.py   (rode antes o exemplo 01)
"""
import logging
import os
import sys
from pathlib import Path

os.environ.setdefault("MLFLOW_DISABLE_AGENT_HINT", "1")

import mlflow
from mlflow import MlflowClient
from mlflow.exceptions import MlflowException

logging.getLogger("mlflow").setLevel(logging.WARNING)
RAIZ = Path(__file__).resolve().parents[2]
mlflow.set_tracking_uri(f"sqlite:///{RAIZ / 'mlflow.db'}")
MODELO, METRICA, MARGEM = "cancer-clf", "roc_auc", 0.0005  # só promove se ganhar por pelo menos MARGEM
client = MlflowClient()

runs = mlflow.search_runs(experiment_names=["cancer-de-mama"], order_by=[f"metrics.{METRICA} DESC"], max_results=1)
if runs.empty:
    sys.exit("Nenhum run encontrado: rode antes o exemplo 01.")
melhor = runs.iloc[0]
nota_nova = melhor[f"metrics.{METRICA}"]

# Já existe esta versão? (rodar o script duas vezes não deve registrar o mesmo run de novo)
existentes = client.search_model_versions(f"name='{MODELO}' and run_id='{melhor.run_id}'")
if existentes:
    versao = existentes[0]
    print(f"run {melhor.run_id[:8]} já registrado como versão {versao.version}")
else:
    # MLflow 3: o modelo é um "LoggedModel" com URI própria (models:/m-<id>), não um artefato do run.
    logado = mlflow.search_logged_models(
        experiment_ids=[melhor.experiment_id], filter_string=f"source_run_id = '{melhor.run_id}'", output_format="list"
    )[0]
    versao = mlflow.register_model(logado.model_uri, MODELO)
    print(f"registrada a versão {versao.version} de '{MODELO}' (run {melhor['tags.mlflow.runName']}, {METRICA}={nota_nova:.4f})")

try:
    champion = client.get_model_version_by_alias(MODELO, "champion")
    nota_champion = client.get_run(champion.run_id).data.metrics[METRICA]
except MlflowException:  # ainda não há champion
    champion, nota_champion = None, float("-inf")

if champion and champion.version == versao.version:
    print(f"versão {versao.version} já é o champion: nada a fazer")
elif nota_nova >= nota_champion + MARGEM:
    client.set_registered_model_alias(MODELO, "champion", versao.version)
    print(f"PROMOVIDA: versão {versao.version} é o novo champion ({METRICA} {nota_champion:.4f} -> {nota_nova:.4f})")
else:
    client.set_registered_model_alias(MODELO, "challenger", versao.version)
    print(f"MANTIDO o champion v{champion.version} ({nota_champion:.4f}); v{versao.version} ficou como challenger ({nota_nova:.4f})")

# Quem consome resolve o alias na hora: trocar o champion não exige mudar código.
modelo = mlflow.sklearn.load_model(f"models:/{MODELO}@champion")
from sklearn.datasets import load_breast_cancer  # noqa: E402  (só para a demonstração final)
X, _ = load_breast_cancer(return_X_y=True, as_frame=True)
print(f"models:/{MODELO}@champion prevê para os 3 primeiros exames: {modelo.predict(X.head(3)).tolist()}  (0 = maligno)")
