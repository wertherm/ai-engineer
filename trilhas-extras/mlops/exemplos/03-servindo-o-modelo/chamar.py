"""Cliente da API do modelo: o mesmo contrato que um sistema de produção usaria.

O MLflow aceita o payload em "dataframe_split" (colunas + linhas), "dataframe_records" (lista de dicts)
ou "inputs". A assinatura logada no exemplo 01 valida nomes e tipos das colunas.
"""
import os

import httpx
from sklearn.datasets import load_breast_cancer

URL = os.getenv("MODELO_URL", "http://localhost:5001")
X, y = load_breast_cancer(return_X_y=True, as_frame=True)
amostra = X.iloc[[0, 1, 19, 20]]  # 2 malignos e 2 benignos do dataset

print("ping:", httpx.get(f"{URL}/ping").status_code)

r = httpx.post(f"{URL}/invocations", json={"dataframe_split": amostra.to_dict(orient="split")})
print("previsões:", r.json()["predictions"], "| real:", y.iloc[[0, 1, 19, 20]].tolist(), "(0 = maligno)")

# Payload quebrado: falta uma coluna. A assinatura barra antes de chegar no modelo.
r = httpx.post(f"{URL}/invocations", json={"dataframe_split": amostra.drop(columns=["mean radius"]).to_dict(orient="split")})
erro = r.json()
print(f"sem a coluna 'mean radius' -> HTTP {r.status_code} {erro['error_code']}: {erro['message'].rsplit('Error: ', 1)[-1]}")
