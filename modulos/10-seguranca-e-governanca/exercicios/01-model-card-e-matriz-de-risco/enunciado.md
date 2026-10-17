# Exercício 01 · Model card + matriz de risco do modelo de câncer de mama

## Contexto

O hospital quer usar o classificador da [trilha MLOps](../../../../trilhas-extras/mlops/) (regressão logística
no dataset Breast Cancer Wisconsin) para **priorizar laudos** de punção. Antes de qualquer piloto, o comitê de
governança pede um **model card** e uma **matriz de risco** ([docs/01](../../docs/01-governanca-e-regulacao.md)).

## Requisitos

1. Um script Python que treina o modelo (mesmo split do [exemplo 01](../../exemplos/01-explicabilidade/)) e
   **gera** `model-card.md` com números calculados na hora (nada digitado à mão).
2. Trate **maligno** como classe positiva e escolha o limiar por uma **meta de recall** definida por você,
   usando validação cruzada **no treino** (não no teste).
3. Tabela "efeito do limiar" no teste (recall, precisão, falsos negativos e positivos para vários limiares).
4. Desempenho **por fatia**. O dataset não tem atributos demográficos: use tamanho do tumor (tercis de
   `mean radius`) e registre essa limitação no card.
5. Seções do card: detalhes do modelo, uso pretendido e fora do escopo, dados, métricas, considerações éticas
   e limitações, matriz de risco.
6. Matriz com ao menos 5 riscos (técnicos, humanos, legais), cada um com probabilidade, impacto, nível,
   classe, mitigação e **dono**.

## Critério de pronto

- `uv run python exercicios/01-model-card-e-matriz-de-risco/solucao/model_card.py` roda sem erro e gera o card.
- O limiar vem da validação cruzada; o card diz qual meta foi usada.
- Pelo menos um risco ALTO (nível ≥ 15) com mitigação e dono.

## Dicas

- `cross_val_predict(modelo, X_tr, y_tr, cv=5, method="predict_proba")` dá probabilidades "fora da amostra" no treino.
- Fatia com zero positivos tem recall indefinido: mostre "n/a" em vez de quebrar.
- Base legal: dado de saúde é **sensível** (LGPD art. 5º II, art. 11) e decisão automatizada tem direito de revisão (art. 20).
- `DataFrame.to_markdown` exige o pacote `tabulate`; uma função de 8 linhas resolve sem dependência nova.

## Saída real da solução

```
recall na validação cruzada: {0.5: '0.943', 0.4: '0.956', 0.3: '0.962', 0.2: '0.969', 0.1: '0.981', 0.05: '0.981'}
ROC AUC=0.9977
 limiar  recall_maligno  precisao  falsos_negativos  falsos_positivos
  0.500           0.981     0.981                 1                 1
  0.400           0.981     0.912                 1                 5
  0.300           0.981     0.897                 1                 6
  0.200           0.981     0.897                 1                 6
  0.100           1.000     0.828                 0                11
  0.050           1.000     0.716                 0                21

Limiar escolhido na validação cruzada (recall >= 0.98): 0.1
Por fatia (limiar 0.1):
  fatia  n  malignos  recall_maligno  falsos_negativos
pequeno 48         1           1.000                 0
  médio 48        11           1.000                 0
 grande 47        41           1.000                 0

Riscos ALTO: Falso negativo: tumor maligno classifica

Model card gravado em model-card.md (54 linhas)
```

O card gerado está em [solucao/model-card.md](solucao/model-card.md). Note que a meta de 0,99 **não é
atingível** nem com limiar 0,05 na validação cruzada (máximo 0,981): o card precisa dizer isso ao comitê.
