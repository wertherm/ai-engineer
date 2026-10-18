# 02 · Vieses e equidade: métricas por grupo e mitigação

**Conceito novo:** medir equidade (paridade demográfica, igualdade de oportunidade/TPR, disparate impact 80%)
e comparar 3 mitigações com o custo de cada uma. Métricas implementadas à mão (o `fairlearn` 0.15.0 suporta
Python 3.14, mas não foi necessário). Teoria em [docs/02](../../docs/02-explicabilidade-e-vieses.md).
**Pré-requisito:** [exemplo 01](../01-explicabilidade/).

Dataset: **Adult** (censo dos EUA de 1994, UCI, licença CC BY 4.0), baixado do OpenML (id 1590) na 1ª
execução (~2 MB, cache em `~/scikit_learn_data`). O modelo é treinado **sem** a coluna `sex`.

## Como rodar

```bash
cd modulos/10-seguranca-e-governanca
uv run python exemplos/02-vieses-e-equidade/equidade.py    # ou: npm run ex02
```

## Saída esperada

Saída real (2026-10-16, scikit-learn 1.9.1, pandas 3.0.6):

```
Linhas: 45222  |  taxa base >50K: Female=0.114, Male=0.312

[1. base (sem 'sex', limiar 0,5)]
  Female: sel=0.082 tpr=0.494 fpr=0.026 | Male: sel=0.256 tpr=0.599 fpr=0.101
  acurácia=0.842  dif_paridade=0.174  dif_oportunidade(TPR)=0.105  disparate_impact=0.319 (ABAIXO de 0,8)

[2. reponderação (pré-processamento)]
  Female: sel=0.127 tpr=0.668 fpr=0.054 | Male: sel=0.216 tpr=0.535 fpr=0.072
  acurácia=0.841  dif_paridade=0.089  dif_oportunidade(TPR)=0.133  disparate_impact=0.588 (ABAIXO de 0,8)

Limiares por grupo (alvo TPR=0.595): Female=0.437, Male=0.510

[3. limiar por grupo (pós-processamento)]
  Female: sel=0.093 tpr=0.534 fpr=0.034 | Male: sel=0.249 tpr=0.587 fpr=0.096
  acurácia=0.841  dif_paridade=0.156  dif_oportunidade(TPR)=0.053  disparate_impact=0.374 (ABAIXO de 0,8)

Limiares por grupo (alvo seleção=0.201): Female=0.177, Male=0.598

[4. limiar por grupo p/ paridade demográfica]
  Female: sel=0.197 tpr=0.835 fpr=0.111 | Male: sel=0.201 tpr=0.511 fpr=0.061
  acurácia=0.831  dif_paridade=0.004  dif_oportunidade(TPR)=0.325  disparate_impact=0.980 (OK)
```

O que observar:
- **Sem a coluna `sex`** o disparate impact é 0,319: os proxies (`relationship=Husband/Wife`, ocupação) trazem o viés de volta.
- A **reponderação** melhora a paridade quase sem custo de acurácia e não usa o atributo na inferência, mas inverte a diferença de TPR.
- O **limiar por grupo para TPR** reduz a diferença de oportunidade pela metade (0,105 → 0,053).
- Só a **paridade demográfica** passa nos 80% (0,980), ao custo de 1,1 ponto de acurácia e de uma diferença de TPR de 0,325:
  com taxas base diferentes (11% x 31%), as métricas brigam entre si.

## Experimente

1. Troque o atributo sensível para `race` (agrupe em "White" x demais) e veja quais métricas pioram.
2. Recoloque `sex` nas features: quanto o disparate impact da base muda? Isso mede quanto os proxies já carregavam.
3. Instale `fairlearn` num `pyproject.toml` próprio e compare com `fairlearn.metrics.demographic_parity_difference`.

## Versão Python

Este exemplo já é em Python. Também roda com o `pyproject.toml` próprio do módulo, a partir da pasta do módulo:

```bash
cd modulos/10-seguranca-e-governanca
uv sync
uv run python exemplos/02-vieses-e-equidade/equidade.py
```

Saída esperada (Python): a mesma de cima (conferida em 2026-10-17: `Linhas: 45222  |  taxa base >50K: Female=0.114, Male=0.312`).
