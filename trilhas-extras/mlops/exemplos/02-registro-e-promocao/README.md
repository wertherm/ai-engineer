# 09 · Model Registry: versões, aliases e champion/challenger

**Conceito novo:** **registro de modelos**. O melhor run vira uma **versão** numerada de um modelo
registrado, e um **alias** (`champion`) aponta para a versão que está em produção. Quem consome pede
`models:/cancer-clf@champion` e nunca um número fixo.
**Pré-requisito:** [exemplo 01](../01-experimentos-com-mlflow/). Teoria em [docs/02](../../docs/02-experimentos-registro-e-serving.md).

## Como rodar

```bash
uv run python exemplos/02-registro-e-promocao/promover.py   # rode duas vezes
```

## Saída esperada

Saída real (2026-10-13), num banco com só os runs do exemplo 01:

```
Successfully registered model 'cancer-clf'.
Created version '1' of model 'cancer-clf'.
registrada a versão 1 de 'cancer-clf' (run logreg-C1.0, roc_auc=0.9977)
PROMOVIDA: versão 1 é o novo champion (roc_auc -inf -> 0.9977)
models:/cancer-clf@champion prevê para os 3 primeiros exames: [0, 0, 0]  (0 = maligno)
```

Segunda execução (idempotente: não registra o mesmo run de novo):

```
run b233557f já registrado como versão 1
versão 1 já é o champion: nada a fazer
```

O que observar:
- **Stages (`Staging`/`Production`) estão deprecados desde o MLflow 2.9.** Tutoriais com `transition_model_version_stage` estão desatualizados: use aliases.
- **No MLflow 3, o modelo é um *LoggedModel*** com URI própria (`models:/m-<id>`), não um artefato do run. A
  primeira versão deste script usava `runs:/<id>/modelo` e o MLflow avisou:
  `Run ... has no artifacts at artifact path 'modelo', registering model based on models:/m-... instead`.
  O script agora busca o LoggedModel com `mlflow.search_logged_models`.

## Experimente

1. Rode o [exercício 01](../../exercicios/01-escolher-a-metrica/) e registre o vencedor como `challenger`.
2. Na UI (aba **Models**), mova o alias `champion` para outra versão e rode a última linha do script de novo.
3. Troque `METRICA` para `recall_maligno` e pense: qual métrica deveria decidir a promoção?
