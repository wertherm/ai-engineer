# 02 · Interpretabilidade, explicabilidade e vieses

## Objetivo

Explicar um modelo de forma global (o que ele usa) e local (por que esta previsão), medir vieses com
métricas de equidade por grupo e escolher uma mitigação sabendo o que ela custa.

## Explicação

### Interpretabilidade x explicabilidade

- **Interpretável**: o modelo é legível por construção (regressão linear/logística, árvore rasa). Você lê os
  pesos e entende.
- **Explicável**: o modelo é uma caixa-preta (gradient boosting, rede neural, LLM) e você usa uma técnica
  **por fora** para aproximar o porquê. A explicação é um modelo do modelo: pode errar.

Analogia: interpretável é a receita escrita; explicável é provar o bolo e adivinhar os ingredientes.

| Pergunta | Técnica | Escopo |
|---|---|---|
| Quais atributos o modelo usa? | importância por permutação, \|coeficientes\| | global |
| Por que este caso deu "maligno"? | contribuições lineares, SHAP, LIME | local |
| O que mudaria a decisão? | contrafactual ("se a renda fosse X, aprovaria") | local |

**Importância por permutação**: embaralhe uma coluna no conjunto de teste e veja quanto a métrica cai.
Funciona com qualquer modelo. Cuidado com atributos correlacionados: um "cobre" o outro e ambos parecem
inúteis. No [exemplo 01](../exemplos/01-explicabilidade/), embaralhar `worst texture` sozinho derruba o AUC em
0,0044, mas embaralhar o **grupo** raio/perímetro/área (9 colunas) derruba em 0,2264.

**Contribuição linear (= SHAP linear)**: numa regressão logística com atributos padronizados,
`logit = intercepto + Σ coef_j · z_j`. Cada termo `coef_j · z_j` é a contribuição do atributo, e a soma bate
exatamente com a saída do modelo. É o que o pacote `shap` calcula para modelos lineares assumindo atributos
independentes; por isso o módulo não precisa dele.

### Vieses e responsabilidade

Viés entra por vários lugares: **dados históricos** (o mundo já era desigual), **amostragem** (grupo sub-representado),
**rótulo** (quem rotulou tinha preconceito), **proxies** (CEP, estado civil "carregam" raça e sexo) e
**uso** (modelo aplicado a uma população diferente da do treino).

Métricas de equidade por grupo (A = atributo sensível, Ŷ = decisão, Y = verdade):

| Métrica | Definição | Pergunta que responde |
|---|---|---|
| Paridade demográfica | P(Ŷ=1 \| A=a) igual entre grupos | todos os grupos são aprovados na mesma taxa? |
| Igualdade de oportunidade | TPR = P(Ŷ=1 \| Y=1, A=a) igual | quem merece é aprovado igualmente? |
| Equalized odds | TPR **e** FPR iguais | erros iguais nos dois sentidos? |
| Disparate impact | menor taxa de seleção / maior ≥ 0,8 | passa na "regra dos 80%" (EEOC, EUA)? |

**Teorema da impossibilidade, na prática**: se as taxas base diferem entre grupos, não dá para ter paridade
demográfica e igualdade de oportunidade ao mesmo tempo (salvo modelo perfeito). Escolher a métrica é uma
decisão **de negócio, jurídica e ética**, não técnica. Registre quem decidiu e por quê.

Mitigações:

| Momento | Técnica | Precisa do atributo na inferência? |
|---|---|---|
| pré-processamento | reponderação (Kamiran & Calders) | não |
| no treino | restrições de equidade (ex.: `fairlearn.reductions`) | não |
| pós-processamento | limiar por grupo (Hardt et al.) | **sim**, o que pode ser proibido em alguns contextos |

Resultados reais do [exemplo 02](../exemplos/02-vieses-e-equidade/) (Adult, sem a coluna `sex`):

| Estratégia | Acurácia | Dif. paridade | Dif. TPR | Disparate impact |
|---|---|---|---|---|
| base | 0,842 | 0,174 | 0,105 | 0,319 |
| reponderação | 0,841 | 0,089 | 0,133 | 0,588 |
| limiar por grupo (TPR) | 0,841 | 0,156 | 0,053 | 0,374 |
| limiar por grupo (paridade) | 0,831 | 0,004 | 0,325 | 0,980 |

Atingir a regra dos 80% custou 1,1 ponto de acurácia e **triplicou** a diferença de TPR: não há almoço grátis.

## Código mínimo

```python
def disparate_impact(y_pred, grupo):
    taxas = [y_pred[grupo == g].mean() for g in set(grupo)]
    return min(taxas) / max(taxas)   # < 0,8 = alerta
```

## Na prática

- [Exemplo 01 · explicabilidade](../exemplos/01-explicabilidade/)
- [Exemplo 02 · vieses e equidade](../exemplos/02-vieses-e-equidade/)
- [Exercício 01 · model card](../exercicios/01-model-card-e-matriz-de-risco/) (por fatia, quando não há atributo demográfico)

## Armadilhas

- **"Tirei a coluna sensível, logo não há viés."** O exemplo 02 treina sem `sex` e o disparate impact é 0,319.
- **Medir equidade sem guardar o atributo sensível.** Sem ele você não mede nada; colete com base legal
  (LGPD art. 11) e acesso restrito, só para auditoria.
- **Explicação como verdade.** Importância por permutação engana com atributos correlacionados; SHAP em
  modelo não linear depende da distribuição de fundo escolhida.
- **Escolher o limiar no conjunto de teste.** Vazamento: use validação (o exercício 01 usa validação cruzada).
- **Grupos pequenos.** Uma fatia com 1 caso positivo tem recall 0 ou 1: reporte o `n` junto.

## Fontes

- Permutation importance (scikit-learn): https://scikit-learn.org/stable/modules/permutation_importance.html
- SHAP (linear explainer): https://shap.readthedocs.io/en/latest/ · Lundberg & Lee (2017): https://arxiv.org/abs/1705.07874
- Fairlearn, métricas e mitigações: https://fairlearn.org/main/user_guide/assessment/index.html
- Hardt, Price, Srebro (2016), Equality of Opportunity: https://arxiv.org/abs/1610.02413
- Kamiran & Calders (2012), reponderação: https://doi.org/10.1007/s10115-011-0463-8
- Regra dos 4/5 (EEOC, 29 CFR 1607.4(D)): https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XIV/part-1607/section-1607.4
- Dataset Adult (UCI, CC BY 4.0): https://archive.ics.uci.edu/dataset/2/adult · OpenML 1590: https://www.openml.org/d/1590
