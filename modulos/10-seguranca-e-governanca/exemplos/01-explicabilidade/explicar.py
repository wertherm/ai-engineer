"""Explicabilidade de um classificador scikit-learn (câncer de mama).

Global: importância por permutação (quanto a métrica piora ao embaralhar cada atributo).
Local: contribuição de cada atributo para UMA previsão de um modelo linear, em log-odds.
Para regressão logística com atributos padronizados, coef_j * z_j é exatamente o valor SHAP
"linear" (base = média do treino), então não precisamos instalar o pacote shap.
"""

import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 42

dados = load_breast_cancer(as_frame=True)
X, y = dados.data, dados.target  # atenção: no dataset, 0 = maligno e 1 = benigno
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, stratify=y, random_state=SEED)

modelo = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000))
modelo.fit(X_tr, y_tr)
proba_benigno = modelo.predict_proba(X_te)[:, 1]
print(f"roc_auc={roc_auc_score(y_te, proba_benigno):.4f} "
      f"recall_maligno={recall_score(y_te, modelo.predict(X_te), pos_label=0):.3f}")

# ---------- 1) Explicação GLOBAL: importância por permutação ----------
# Calculada no conjunto de TESTE: mede o que o modelo usa para generalizar, não o que decorou.
perm = permutation_importance(modelo, X_te, y_te, scoring="roc_auc", n_repeats=20, random_state=SEED)
ordem = np.argsort(perm.importances_mean)[::-1]
print("\nTop 5 por importância de permutação (queda de roc_auc):")
for i in ordem[:5]:
    print(f"  {X.columns[i]:<24} {perm.importances_mean[i]:.4f} ± {perm.importances_std[i]:.4f}")

# Atributos muito correlacionados (raio, perímetro, área...) "se cobrem": embaralhar um só quase não
# piora o modelo, porque os outros carregam a mesma informação. Embaralhar o GRUPO inteiro revela o peso real.
rng = np.random.default_rng(SEED)
print("Permutação por GRUPO de atributos correlacionados:")
base_auc = roc_auc_score(y_te, proba_benigno)
for nome, prefixo in [("tamanho (radius/perimeter/area, 9 colunas)", ("radius", "perimeter", "area")),
                      ("textura (3 colunas)", ("texture",))]:
    grupo = [c for c in X.columns if any(p in c for p in prefixo)]
    quedas = []
    for _ in range(20):
        X_emb = X_te.copy()
        X_emb[grupo] = X_te[grupo].to_numpy()[rng.permutation(len(X_te))]  # mesma permutação no grupo
        quedas.append(base_auc - roc_auc_score(y_te, modelo.predict_proba(X_emb)[:, 1]))
    print(f"  {nome:<42} queda={np.mean(quedas):.4f}")

coef = modelo[-1].coef_[0]
print("\nTop 5 por |coeficiente| (escala padronizada):")
for i in np.argsort(np.abs(coef))[::-1][:5]:
    print(f"  {X.columns[i]:<24} {coef[i]:+.3f}")

# ---------- 2) Explicação LOCAL: por que ESTE paciente? ----------
# Pegamos o caso de teste mais "em cima do muro" (probabilidade mais perto de 0,5):
# é onde um médico mais precisa entender o motivo da previsão.
idx = int(np.argmin(np.abs(proba_benigno - 0.5)))
x = X_te.iloc[[idx]]
scaler, lr = modelo[0], modelo[-1]
z = scaler.transform(x)[0]          # quantos desvios-padrão o atributo está da média do treino
contrib = coef * z                  # contribuição em log-odds de "benigno"
base = lr.intercept_[0]             # previsão para um paciente "médio" (z = 0)
logit = base + contrib.sum()

# Checagem: a soma das contribuições reproduz exatamente a saída do modelo.
assert np.isclose(logit, modelo.decision_function(x)[0])

p_maligno = 1 - 1 / (1 + np.exp(-logit))
print(f"\nCaso #{x.index[0]} (rótulo real: {'maligno' if y_te.iloc[idx] == 0 else 'benigno'}) "
      f"-> P(maligno)={p_maligno:.4f}")
print(f"  base (paciente médio) = {base:+.3f} log-odds de benigno")
for titulo, idxs in [("empurraram para MALIGNO (contribuição negativa)", np.argsort(contrib)[:4]),
                     ("empurraram para BENIGNO (contribuição positiva)", np.argsort(contrib)[::-1][:4])]:
    print(f"  atributos que mais {titulo}:")
    for i in idxs:
        print(f"    {X.columns[i]:<24} valor={x.iloc[0, i]:>9.3f}  z={z[i]:+.2f}  contrib={contrib[i]:+.3f}")
print(f"  soma = {base:+.3f} + {contrib.sum():+.3f} = {logit:+.3f} (confere com decision_function)")
