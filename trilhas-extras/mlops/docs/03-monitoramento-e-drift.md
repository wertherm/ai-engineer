# 12 · Monitoramento e drift

## Objetivo

Saber **por que** um modelo piora sem que nada "quebre", **como** detectar isso antes do estrago e
**quando** retreinar.

## Os três tipos de drift

| Tipo | O que muda | Exemplo neste repo | Como detectar |
|---|---|---|---|
| **Data drift** | a distribuição das entradas, P(X) | aparelho novo mede o raio 25% maior | testes estatísticos entrada a entrada (KS, qui-quadrado, PSI) |
| **Prediction drift** | a distribuição das saídas, P(ŷ) | fração prevista como maligno vai de 37% para 41% | comparar a taxa de cada classe prevista |
| **Concept drift** | a relação entre entrada e alvo, P(y\|X) | a mesma medida passa a significar outra coisa (novo protocolo clínico) | só com rótulo verdadeiro: o desempenho cai |

Os termos se sobrepõem: data drift pode causar queda de desempenho, mas também pode ser inofensivo. Por
isso se monitoram **os três sinais**, e o desempenho real sempre que o rótulo chega.

## Testes estatísticos

| Teste | Para | Leitura |
|---|---|---|
| **KS** (Kolmogorov-Smirnov, `scipy.stats.ks_2samp`) | colunas numéricas | p ≤ 0,05 → as distribuições diferem |
| **Qui-quadrado** (`scipy.stats.chi2_contingency`) | colunas categóricas | p ≤ 0,05 → as proporções diferem |
| **PSI** (Population Stability Index) | qualquer coluna, por faixas | < 0,10 estável · 0,10–0,25 moderado · > 0,25 significativo |

O **Evidently** (0.7) usa exatamente esses testes por padrão em amostras pequenas (até 1000 linhas de
referência) e troca para distâncias (Wasserstein, Jensen-Shannon) em amostras grandes. O drift do
dataset inteiro é declarado pela fração de colunas com drift.

```python
from evidently import Report
from evidently.presets import DataDriftPreset

resultado = Report([DataDriftPreset()]).run(current_data=producao, reference_data=treino)
```

A API mudou no Evidently 0.7 (abril de 2025): tutoriais com `ColumnMapping` e `report.run(...)` sem
objeto de resultado são da API antiga.

## Cuidados com os testes

- **Múltiplos testes**: com 30 colunas a p ≤ 0,05, espere ~1,5 falso alarme por lote mesmo sem drift. Use
  um limite de fração de colunas, PSI ou correção (Bonferroni).
- **Amostras grandes** deixam o KS "sensível demais": com milhões de linhas, qualquer diferença minúscula
  dá p ≈ 0. Por isso o Evidently troca de teste acima de 1000 linhas.
- **Os cortes do PSI (0,10 e 0,25) são convenção**, não estatística: o valor crítico correto depende do
  tamanho da amostra e do número de faixas.
- **Nem toda coluna pesa igual**: drift numa coluna que o modelo quase não usa importa pouco.

## Do alerta ao retreino

1. **Monitore** drift de dados e de previsão a cada lote ([exercício 02](../exercicios/02-alerta-de-drift/)).
2. **Investigue** antes de retreinar: drift pode ser bug no pipeline de dados (unidade trocada, coluna vazia).
3. **Retreine** (CT) com dados recentes, pelo pipeline ([exemplo 05](../exemplos/05-pipeline-de-treino/)), e
   deixe o **portão** decidir se a versão nova vira champion.
4. **Meça o desempenho real** quando os rótulos chegarem e alimente o próximo treino.

## Armadilhas

- Monitorar só a infraestrutura (CPU, latência) e não a **qualidade** das previsões.
- Disparar retreino automático a cada alerta, sem portão: um bug de dados vira um modelo ruim em produção.
- Usar o próprio conjunto de teste como referência e como "produção": não há drift para achar.

## Fontes

- Evidently, métodos de drift: https://docs.evidentlyai.com/metrics/explainer_drift
- Evidently, migração para a API 0.7: https://docs.evidentlyai.com/faq/migration
- Evidently, data drift e concept drift: https://www.evidentlyai.com/ml-in-production/data-drift
- `scipy.stats.ks_2samp`: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ks_2samp.html
- Propriedades estatísticas do PSI (Yurdakul & Naranjo): https://arxiv.org/pdf/2303.01227
