"""Gera dois "lotes de produção" para testar o alerta: um normal e um com drift."""
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split

X, y = load_breast_cancer(return_X_y=True, as_frame=True)
producao = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)[1]
producao.to_csv("lote_normal.csv", index=False)
drift = producao.copy()
drift["mean radius"] *= 1.25
drift["mean texture"] += 4.0
drift.to_csv("lote_drift.csv", index=False)
print("gerados: lote_normal.csv e lote_drift.csv")
