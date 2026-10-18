# 01 · Explicabilidade: importância por permutação e explicação local

**Conceito novo:** explicar um modelo **globalmente** (quais atributos ele usa) e **localmente** (por que
esta previsão), sem instalar `shap`: num modelo linear com atributos padronizados, `coef · z` é a contribuição
exata de cada atributo. Teoria em [docs/02](../../docs/02-explicabilidade-e-vieses.md).
**Pré-requisito:** nenhum. Mesmo modelo da [trilha MLOps](../../../../trilhas-extras/mlops/exemplos/01-experimentos-com-mlflow/).

## Como rodar

```bash
cd modulos/10-seguranca-e-governanca
uv run python exemplos/01-explicabilidade/explicar.py      # ou: npm run ex01
```

## Saída esperada

Saída real (2026-10-16, Python 3.14.7, scikit-learn 1.9.1; determinística com `random_state=42`):

```
roc_auc=0.9977 recall_maligno=0.981

Top 5 por importância de permutação (queda de roc_auc):
  worst texture            0.0044 ± 0.0020
  area error               0.0038 ± 0.0024
  radius error             0.0037 ± 0.0023
  ...
Permutação por GRUPO de atributos correlacionados:
  tamanho (radius/perimeter/area, 9 colunas) queda=0.2264
  textura (3 colunas)                        queda=0.0090

Top 5 por |coeficiente| (escala padronizada):
  worst texture            -1.250
  radius error             -1.070
  ...
Caso #363 (rótulo real: benigno) -> P(maligno)=0.4451
  base (paciente médio) = +0.281 log-odds de benigno
  atributos que mais empurraram para MALIGNO (contribuição negativa):
    worst radius             valor=   18.130  z=+0.40  contrib=-0.368
    mean radius              valor=   16.500  z=+0.69  contrib=-0.362
    ...
  atributos que mais empurraram para BENIGNO (contribuição positiva):
    worst symmetry           valor=    0.239  z=-0.79  contrib=+0.759
    ...
  soma = +0.281 + -0.060 = +0.220 (confere com decision_function)
```

O que observar:
- Cada atributo isolado parece irrelevante (queda ≤ 0,0044), mas o **grupo** de tamanho derruba o AUC em 0,2264:
  atributos correlacionados se cobrem e enganam a importância por permutação.
- O caso de fronteira (P=0,445) é explicado por "tumor grande" contra "forma simétrica": uma explicação que um
  médico consegue contestar. Isso é o que o art. 20 da LGPD pede ao falar em critérios da decisão.

## Experimente

1. Troque `scoring="roc_auc"` por `"recall"` na permutação: os atributos importantes mudam com a métrica.
2. Troque o modelo por `RandomForestClassifier`: a permutação continua funcionando, a contribuição linear não
   (aí entraria o `shap.TreeExplainer`).
3. Escolha `idx` do caso com maior P(maligno) e veja contribuições de -11 log-odds (um caso extremo, z=+12).

## Versão Python

Este exemplo já é em Python. Desde a versão Python do módulo, ele também roda com o `pyproject.toml` próprio
do módulo (scikit-learn 1.9.1, pandas 3.0.6, numpy 2.5.4), a partir da pasta do módulo:

```bash
cd modulos/10-seguranca-e-governanca
uv sync
uv run python exemplos/01-explicabilidade/explicar.py
```

Saída esperada (Python): a mesma de cima (conferida em 2026-10-17: `roc_auc=0.9977 recall_maligno=0.981`).
