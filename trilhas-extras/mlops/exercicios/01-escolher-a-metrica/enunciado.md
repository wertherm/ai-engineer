# Exercício 04 · Escolher o modelo pela métrica certa

**Tópicos praticados:** exemplos 01 e 02 · [docs/01](../../docs/01-mlops-fundamentos.md)

## Contexto

O hospital quer o melhor classificador de tumores. "Melhor" não é a maior acurácia: o erro caro é o
**falso negativo** (dizer "benigno" para um tumor maligno). A acurácia esconde esse erro quando as classes
são desbalanceadas (aqui, 37% malignos).

## Requisitos

1. Treine pelo menos 3 algoritmos diferentes no mesmo split (`random_state=42`, `stratify=y`).
2. Registre cada um como um run no MLflow, num experimento próprio, com `accuracy`, `recall_maligno` e `roc_auc`.
3. Escolha o vencedor com uma **regra escrita no código**: maior `recall_maligno`, desempate por `roc_auc`.
4. Use `mlflow.search_runs` para ordenar, sem comparar "no olho".

## Critério de pronto

O script imprime a tabela dos candidatos e o escolhido, e rodá-lo de novo dá o mesmo resultado.

## Dicas

- `recall_score(y, pred, pos_label=0)`: no dataset, `0` é maligno.
- Modelos baseados em distância (KNN) e regressão logística precisam de `StandardScaler`; árvores não.
- Coloque o scaler **dentro** de um `Pipeline`, para não vazar informação do teste para o treino.

A solução está em [`solucao/`](solucao/). Saída real:

```
tags.mlflow.runName  metrics.recall_maligno  metrics.roc_auc  metrics.accuracy
             logreg                0.981132         0.997694          0.986014
                knn                0.943396         0.992348          0.979021
      random-forest                0.924528         0.994864          0.958042
escolhido: logreg (maior recall de malignos; desempate por roc_auc)
```

Repare: a random forest tem roc_auc **maior** que o KNN, mas deixa passar 7,5% dos malignos.
