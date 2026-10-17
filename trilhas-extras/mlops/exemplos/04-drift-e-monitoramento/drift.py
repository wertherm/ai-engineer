"""Data drift: os dados de produção ainda se parecem com os de treino?

Para cada coluna numérica, o teste KS (Kolmogorov-Smirnov) compara duas distribuições:
p-valor <= 0,05 -> as distribuições diferem (drift). O PSI mede o tamanho da mudança.
Também olhamos o PREDICTION drift: a taxa de "maligno" prevista pelo champion mudou?

Cenários:
  A) produção normal: o conjunto de teste, que vem da mesma distribuição do treino;
  B) produção com drift: o mesmo conjunto, simulando um aparelho novo que mede raio e textura maiores.

Uso: uv run python exemplos/04-drift-e-monitoramento/drift.py   (precisa do champion do exemplo 02)
"""
import logging
import os
from pathlib import Path

os.environ.setdefault("MLFLOW_DISABLE_AGENT_HINT", "1")

import mlflow
import numpy as np
from scipy.stats import ks_2samp
from sklearn.datasets import load_breast_cancer
from sklearn.metrics import accuracy_score, recall_score
from sklearn.model_selection import train_test_split

logging.getLogger("mlflow").setLevel(logging.WARNING)
mlflow.set_tracking_uri(f"sqlite:///{Path(__file__).resolve().parents[2] / 'mlflow.db'}")

X, y = load_breast_cancer(return_X_y=True, as_frame=True)
referencia, producao, _, y_producao = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)  # mesmo split do ex. 01

producao_drift = producao.copy()
producao_drift["mean radius"] *= 1.25     # aparelho novo: raio medido 25% maior
producao_drift["mean texture"] += 4.0     # e textura com deslocamento fixo


def psi(ref: np.ndarray, atual: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index com faixas pelos quantis da referência."""
    cortes = np.unique(np.quantile(ref, np.linspace(0, 1, bins + 1)))
    cortes[0], cortes[-1] = -np.inf, np.inf
    p_ref = np.histogram(ref, cortes)[0] / len(ref) + 1e-6   # +1e-6 evita log(0)
    p_atu = np.histogram(atual, cortes)[0] / len(atual) + 1e-6
    return float(np.sum((p_atu - p_ref) * np.log(p_atu / p_ref)))


def relatorio(nome: str, atual) -> None:
    colunas_drift = []
    for coluna in referencia.columns:
        p = ks_2samp(referencia[coluna], atual[coluna]).pvalue
        if p <= 0.05:
            colunas_drift.append((coluna, p, psi(referencia[coluna].to_numpy(), atual[coluna].to_numpy())))
    print(f"== {nome}: {len(colunas_drift)}/{len(referencia.columns)} colunas com drift (KS, p <= 0,05)")
    for coluna, p, valor_psi in colunas_drift:
        print(f"   {coluna:<22} p={p:.2e}  PSI={valor_psi:.2f}")


relatorio("A) produção normal", producao)
relatorio("B) produção com drift", producao_drift)

modelo = mlflow.sklearn.load_model("models:/cancer-clf@champion")
taxa = lambda dados: (modelo.predict(dados) == 0).mean()  # noqa: E731  (fração prevista como maligna)
print("\n== Prediction drift (fração prevista como maligno)")
print(f"   treino={taxa(referencia):.1%}  produção A={taxa(producao):.1%}  produção B={taxa(producao_drift):.1%}")

# Quando o rótulo verdadeiro chega (às vezes semanas depois), dá para medir o estrago de verdade.
print("\n== Desempenho com rótulo verdadeiro")
for nome, dados in [("produção A", producao), ("produção B", producao_drift)]:
    pred = modelo.predict(dados)
    print(f"   {nome}: accuracy={accuracy_score(y_producao, pred):.3f}  recall_maligno={recall_score(y_producao, pred, pos_label=0):.3f}")
