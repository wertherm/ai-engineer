"""Executa o pipeline KFP na sua máquina, sem cluster (kfp.local, cada passo num subprocesso).

Uso: uv run --group kfp python exemplos/05-pipeline-de-treino/rodar_kfp_local.py [C]
Artefatos em .kfp-local/ (na raiz do repo, ignorada pelo git). Com C=10 o recall cai para 0,943 e o passo "registrar" não roda.
"""
import sys
from pathlib import Path

from kfp import local

sys.path.insert(0, str(Path(__file__).parent))
import pipeline_kfp  # noqa: E402

# use_venv=False: usa o Python atual (com scikit-learn instalado) em vez de instalar os pacotes a cada passo.
local.init(runner=local.SubprocessRunner(use_venv=False), pipeline_root=str(Path(__file__).resolve().parents[2] / ".kfp-local"))
C = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
pipeline_kfp.pipeline(C=C)
