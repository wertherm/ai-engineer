#!/usr/bin/env bash
# Sobe uma API REST para o modelo que está com o alias "champion" (ex. 02).
# --env-manager local: usa o Python atual em vez de criar um virtualenv só para o modelo (mais rápido para estudo).
set -euo pipefail
cd "$(dirname "$0")/../.."
export MLFLOW_TRACKING_URI="sqlite:///$PWD/mlflow.db"   # onde o "models:/...@champion" é resolvido
export MLFLOW_DISABLE_AGENT_HINT=1
exec uv run mlflow models serve -m "models:/cancer-clf@champion" -p 5001 --env-manager local
