"""Solução do exercício 01: model card + matriz de risco do classificador de câncer de mama.

Gera `model-card.md` ao lado deste arquivo com números calculados AGORA (nada digitado à mão),
para que o card nunca fique desatualizado em relação ao modelo.
"""

from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, roc_auc_score
from sklearn.model_selection import cross_val_predict, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 42
SAIDA = Path(__file__).with_name("model-card.md")

dados = load_breast_cancer(as_frame=True)
X, y_benigno = dados.data, dados.target
# Mesmo split do exemplo 01 (estratificado pelo rótulo original) e depois invertemos:
# 1 = MALIGNO, a classe que não podemos deixar passar.
X_tr, X_te, yb_tr, yb_te = train_test_split(X, y_benigno, test_size=0.25, stratify=y_benigno, random_state=SEED)
y_tr, y_te = 1 - yb_tr, 1 - yb_te
modelo = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000)).fit(X_tr, y_tr)
p = modelo.predict_proba(X_te)[:, 1]


def medir(y_true, prob, limiar):
    tn, fp, fn, tp = confusion_matrix(y_true, (prob >= limiar).astype(int), labels=[0, 1]).ravel()
    return {"limiar": limiar, "recall_maligno": tp / (tp + fn) if tp + fn else float("nan"), "precisao": tp / max(tp + fp, 1),
            "falsos_negativos": int(fn), "falsos_positivos": int(fp)}


# 1) Escolha do limiar: em triagem, falso negativo (câncer não detectado) é o erro caro.
# Meta clínica: recall de malignos >= 98%. O limiar é escolhido com validação cruzada NO TREINO
# (escolher olhando o teste seria vazamento: o número do card ficaria otimista).
META_RECALL = 0.98  # 0,99 não é atingível nem com limiar 0,05 neste modelo (veja a saída)
GRADE = (0.5, 0.4, 0.3, 0.2, 0.1, 0.05)
p_cv = cross_val_predict(modelo, X_tr, y_tr, cv=5, method="predict_proba")[:, 1]
limiar = max((t for t in GRADE if medir(y_tr, p_cv, t)["recall_maligno"] >= META_RECALL), default=min(GRADE))  # sem limiar que atinja a meta: usa o menor e o card registra
print("recall na validação cruzada:", {t: f"{medir(y_tr, p_cv, t)['recall_maligno']:.3f}" for t in GRADE})
tabela_limiar = pd.DataFrame([medir(y_te, p, t) for t in GRADE])

# 2) Desempenho por fatia: o dataset NÃO tem atributos demográficos (idade, etnia), então avaliamos por
# tamanho do tumor (tercis de "mean radius"). Isso já é uma limitação a declarar no card.
fatias = pd.qcut(X_te["mean radius"], 3, labels=["pequeno", "médio", "grande"])
por_fatia = []
for nome in ["pequeno", "médio", "grande"]:
    m = (fatias == nome).to_numpy()
    r = medir(y_te[m], p[m], limiar)
    por_fatia.append({"fatia": nome, "n": int(m.sum()), "malignos": int(y_te[m].sum()), **r})
por_fatia = pd.DataFrame(por_fatia)

# 3) Matriz de risco: probabilidade (1-5) x impacto (1-5). Nível = produto. >= 15 alto, >= 8 médio.
riscos = [
    ("Falso negativo: tumor maligno classificado como benigno", 3, 5,
     f"limiar {limiar} (meta de recall {META_RECALL}) + revisão humana obrigatória de todo caso; monitorar recall por fatia", "responsável clínico"),
    ("Uso fora do escopo (outro equipamento/hospital, distribuição diferente)", 3, 4,
     "documentar escopo; monitorar drift (KS/PSI) na entrada; bloquear se drift alto", "time de ML"),
    ("Automação excessiva: médico confia cegamente (automation bias)", 3, 4,
     "UI mostra probabilidade + explicação local; modelo nunca decide sozinho", "produto"),
    ("Desempenho desigual por subgrupo não medido (sem dados demográficos)", 3, 4,
     "coletar idade/etnia com base legal (LGPD art. 11) e reavaliar por grupo", "governança de dados"),
    ("Vazamento de dado de saúde (dado sensível, LGPD art. 5º II)", 2, 5,
     "pseudonimizar; acesso mínimo; logs sem identificadores", "segurança"),
    ("Dataset antigo e pequeno (569 casos, 1995) não representa a população atual", 4, 3,
     "validar em dados locais recentes antes de qualquer uso clínico", "time de ML"),
]
matriz = pd.DataFrame(riscos, columns=["risco", "prob", "impacto", "mitigacao", "dono"])
matriz["nivel"] = matriz["prob"] * matriz["impacto"]
matriz["classe"] = np.select([matriz["nivel"] >= 15, matriz["nivel"] >= 8], ["ALTO", "MÉDIO"], "BAIXO")
matriz = matriz.sort_values("nivel", ascending=False)

auc = roc_auc_score(y_te, p)


def tabela_md(df, casas=3):
    """Tabela Markdown sem depender do pacote `tabulate`. NaN vira "n/a" (fatia sem positivos)."""
    def cel(v):
        if isinstance(v, float):
            return "n/a" if np.isnan(v) else f"{v:.{casas}f}"
        return str(v)
    linhas = ["| " + " | ".join(df.columns) + " |", "|" + "---|" * len(df.columns)]
    linhas += ["| " + " | ".join(cel(v) for v in row) + " |" for row in df.itertuples(index=False)]
    return "\n".join(linhas)
escolhido = tabela_limiar.set_index("limiar").loc[limiar]

card = f"""# Model card · Triagem de câncer de mama (regressão logística)

Gerado por `model_card.py` em {date.today().isoformat()} (scikit-learn, `random_state={SEED}`).

## Detalhes do modelo
- Tipo: `StandardScaler` + `LogisticRegression(C=1.0)`; 30 atributos numéricos de imagens de punção (FNA).
- Saída: probabilidade de **maligno**; decisão com limiar **{limiar}**, o maior limiar que atinge
  recall >= {META_RECALL} na validação cruzada de 5 folds do treino.
- Mesma receita da [trilha MLOps](../../../../../trilhas-extras/mlops/exemplos/01-experimentos-com-mlflow/).

## Uso pretendido
- **Pretendido:** apoio à triagem, priorizando laudos para revisão de um patologista.
- **Fora do escopo:** diagnóstico sem revisão humana; outras doenças; dados de outros equipamentos sem revalidação.

## Dados
- Breast Cancer Wisconsin (Diagnostic), 569 casos (212 malignos), embutido no scikit-learn.
- Split estratificado 75/25. **Sem atributos demográficos**: equidade por grupo não pode ser medida.

## Métricas (teste, n={len(y_te)})
- ROC AUC: **{auc:.4f}**
- No limiar {limiar}: recall maligno **{escolhido.recall_maligno:.3f}**, precisão {escolhido.precisao:.3f},
  {int(escolhido.falsos_negativos)} falso(s) negativo(s), {int(escolhido.falsos_positivos)} falso(s) positivo(s).

### Efeito do limiar
{tabela_md(tabela_limiar)}

### Desempenho por fatia (tamanho do tumor)
{tabela_md(por_fatia.drop(columns="limiar"))}

## Considerações éticas e limitações
- Fatias com poucos (ou zero) malignos têm recall instável ou indefinido ("n/a"): poucos exemplos.
- Explicação local disponível por contribuição linear (ver exemplo 01 do módulo 10).
- Decisão final é sempre humana (LGPD art. 20: direito de revisão de decisão automatizada).

## Matriz de risco (probabilidade x impacto, 1-5)
{tabela_md(matriz[["risco", "prob", "impacto", "nivel", "classe", "mitigacao", "dono"]])}
"""
SAIDA.write_text(card, encoding="utf-8")

print(f"ROC AUC={auc:.4f}")
print(tabela_limiar.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
print(f"\nLimiar escolhido na validação cruzada (recall >= {META_RECALL}): {limiar}")
print(f"Por fatia (limiar {limiar}):")
print(por_fatia[["fatia", "n", "malignos", "recall_maligno", "falsos_negativos"]].to_string(index=False, float_format=lambda v: f"{v:.3f}"))
print("\nRiscos ALTO:", ", ".join(matriz.loc[matriz["classe"] == "ALTO", "risco"].str.slice(0, 40)))
print(f"\nModel card gravado em {SAIDA.name} ({len(card.splitlines())} linhas)")
