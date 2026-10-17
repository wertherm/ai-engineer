"""Solução do exercício 02: alerta de data drift para rodar em cron ou CI.

Uso: uv run python alerta_drift.py <producao.csv> [--max-colunas 0.1] [--psi 0.25]
Sai com 1 se a fração de colunas com drift (KS) passar de --max-colunas OU se alguma coluna
tiver PSI acima de --psi. Gere CSVs de teste com: uv run python gerar_lotes.py
"""
import argparse
import sys

import numpy as np
import pandas as pd
from scipy.stats import ks_2samp
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split


def psi(ref: np.ndarray, atual: np.ndarray, bins: int = 10) -> float:
    cortes = np.unique(np.quantile(ref, np.linspace(0, 1, bins + 1)))
    cortes[0], cortes[-1] = -np.inf, np.inf
    p_ref = np.histogram(ref, cortes)[0] / len(ref) + 1e-6
    p_atu = np.histogram(atual, cortes)[0] / len(atual) + 1e-6
    return float(np.sum((p_atu - p_ref) * np.log(p_atu / p_ref)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("producao")
    ap.add_argument("--max-colunas", type=float, default=0.1, help="fração máxima de colunas com drift")
    ap.add_argument("--psi", type=float, default=0.25, help="PSI máximo por coluna")
    a = ap.parse_args()

    X, y = load_breast_cancer(return_X_y=True, as_frame=True)
    referencia = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)[0]  # dados de treino
    producao = pd.read_csv(a.producao)

    faltando = set(referencia.columns) - set(producao.columns)
    if faltando:  # esquema quebrado é alerta imediato, nem dá para comparar
        print(f"ALERTA: colunas ausentes na produção: {sorted(faltando)}")
        return 1

    com_drift, psi_alto = [], []
    for col in referencia.columns:
        if ks_2samp(referencia[col], producao[col]).pvalue <= 0.05:
            com_drift.append(col)
        valor = psi(referencia[col].to_numpy(), producao[col].to_numpy())
        if valor > a.psi:
            psi_alto.append(f"{col} ({valor:.2f})")

    fracao = len(com_drift) / len(referencia.columns)
    ok = fracao <= a.max_colunas and not psi_alto
    print(f"{'OK' if ok else 'ALERTA'}: {len(com_drift)}/{len(referencia.columns)} colunas com drift ({fracao:.0%}, "
          f"limite {a.max_colunas:.0%}); PSI > {a.psi}: {psi_alto or 'nenhuma'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
