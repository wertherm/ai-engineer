"""Vieses e equidade num classificador de renda (dataset Adult, censo dos EUA de 1994).

Tarefa: prever renda > 50K/ano (pense em "aprovar crédito"). Atributo sensível: sexo.
O modelo é treinado SEM a coluna `sex` ("fairness through unawareness") para mostrar que o viés
volta pelos proxies (ex.: relationship=Husband/Wife).

Métricas implementadas à mão (são poucas linhas; o fairlearn faz o mesmo):
- taxa de seleção por grupo e diferença de paridade demográfica;
- TPR por grupo (igualdade de oportunidade) e FPR;
- disparate impact = menor taxa de seleção / maior (regra dos 80% da EEOC).

Mitigações comparadas:
- reponderação (Kamiran & Calders): pré-processamento, NÃO usa o atributo na inferência;
- limiar por grupo para igualar TPR: pós-processamento, PRECISA do atributo na hora de decidir.
"""

import numpy as np
import pandas as pd
from sklearn.compose import make_column_transformer
from sklearn.datasets import fetch_openml
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

SEED = 42

# Download único (~2 MB) do OpenML (id 1590), depois fica em cache em ~/scikit_learn_data.
df = fetch_openml("adult", version=2, as_frame=True).frame.dropna()
y = (df["class"] == ">50K").astype(int).to_numpy()
grupo = df["sex"].astype(str).to_numpy()
X = df.drop(columns=["class", "sex", "fnlwgt"])  # sem o atributo sensível

num = X.select_dtypes("number").columns.tolist()
cat = X.select_dtypes(exclude="number").columns.tolist()

# treino 60% · validação 20% (escolher limiares) · teste 20% (medir)
X_tr, X_tmp, y_tr, y_tmp, g_tr, g_tmp = train_test_split(X, y, grupo, test_size=0.4, stratify=y, random_state=SEED)
X_va, X_te, y_va, y_te, g_va, g_te = train_test_split(X_tmp, y_tmp, g_tmp, test_size=0.5, stratify=y_tmp, random_state=SEED)


def novo_modelo():
    pre = make_column_transformer((StandardScaler(), num), (OneHotEncoder(handle_unknown="ignore"), cat))
    return make_pipeline(pre, LogisticRegression(max_iter=2000))


def metricas(y_true, y_pred, g):
    """Métricas de equidade por grupo + resumo."""
    por_grupo = {}
    for k in np.unique(g):
        m = g == k
        yt, yp = y_true[m], y_pred[m]
        por_grupo[k] = {
            "selecao": yp.mean(),
            "tpr": yp[yt == 1].mean(),   # dos que REALMENTE ganham >50K, quantos o modelo aprova
            "fpr": yp[yt == 0].mean(),
        }
    sel = [v["selecao"] for v in por_grupo.values()]
    tpr = [v["tpr"] for v in por_grupo.values()]
    return por_grupo, {
        "acuracia": (y_true == y_pred).mean(),
        "dif_paridade": max(sel) - min(sel),
        "dif_oportunidade": max(tpr) - min(tpr),
        "disparate_impact": min(sel) / max(sel),
    }


def relatorio(nome, y_pred):
    por_grupo, r = metricas(y_te, y_pred, g_te)
    grupos = " | ".join(f"{k}: sel={v['selecao']:.3f} tpr={v['tpr']:.3f} fpr={v['fpr']:.3f}" for k, v in por_grupo.items())
    alerta = "OK" if r["disparate_impact"] >= 0.8 else "ABAIXO de 0,8"
    print(f"\n[{nome}]\n  {grupos}\n  acurácia={r['acuracia']:.3f}  dif_paridade={r['dif_paridade']:.3f}  "
          f"dif_oportunidade(TPR)={r['dif_oportunidade']:.3f}  disparate_impact={r['disparate_impact']:.3f} ({alerta})")
    return r


print(f"Linhas: {len(df)}  |  taxa base >50K: " +
      ", ".join(f"{k}={y[grupo == k].mean():.3f}" for k in np.unique(grupo)))

# 1) Linha de base: sem o atributo, limiar 0,5
base = novo_modelo().fit(X_tr, y_tr)
p_va, p_te = base.predict_proba(X_va)[:, 1], base.predict_proba(X_te)[:, 1]
relatorio("1. base (sem 'sex', limiar 0,5)", (p_te >= 0.5).astype(int))

# 2) Reponderação: peso = P(grupo) * P(rótulo) / P(grupo, rótulo).
# Faz grupo e rótulo parecerem independentes no treino; o modelo final não vê o atributo.
w = np.ones(len(y_tr))
for k in np.unique(g_tr):
    for c in (0, 1):
        m = (g_tr == k) & (y_tr == c)
        w[m] = (g_tr == k).mean() * (y_tr == c).mean() / m.mean()
repond = novo_modelo().fit(X_tr, y_tr, logisticregression__sample_weight=w)
relatorio("2. reponderação (pré-processamento)", (repond.predict_proba(X_te)[:, 1] >= 0.5).astype(int))

# 3) Limiar por grupo: escolhido na VALIDAÇÃO para que cada grupo tenha TPR ~ igual ao TPR global da base.
alvo_tpr = (p_va[y_va == 1] >= 0.5).mean()
limiares = {}
for k in np.unique(g_va):
    pos = np.sort(p_va[(g_va == k) & (y_va == 1)])
    limiares[k] = float(np.quantile(pos, 1 - alvo_tpr))  # aprova a fração alvo_tpr dos positivos do grupo
print(f"\nLimiares por grupo (alvo TPR={alvo_tpr:.3f}): " + ", ".join(f"{k}={v:.3f}" for k, v in limiares.items()))
lim_te = np.array([limiares[k] for k in g_te])
relatorio("3. limiar por grupo (pós-processamento)", (p_te >= lim_te).astype(int))

# 4) Limiar por grupo para PARIDADE DEMOGRÁFICA: cada grupo aprova a mesma fração de pessoas.
# Como as taxas base são diferentes (11% x 31%), isso força errar mais: é o trade-off na prática.
alvo_sel = (p_va >= 0.5).mean()
lim_dp = {k: float(np.quantile(p_va[g_va == k], 1 - alvo_sel)) for k in np.unique(g_va)}
print(f"\nLimiares por grupo (alvo seleção={alvo_sel:.3f}): " + ", ".join(f"{k}={v:.3f}" for k, v in lim_dp.items()))
relatorio("4. limiar por grupo p/ paridade demográfica", (p_te >= np.array([lim_dp[k] for k in g_te])).astype(int))
