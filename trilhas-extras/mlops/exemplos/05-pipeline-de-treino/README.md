# 12 · Pipeline de treino reprodutível (e a ponte para o OpenShift AI)

**Conceito novo:** **pipeline** (nível 1 de maturidade de MLOps do Google). Treinar deixa de ser "rodar o
notebook" e vira uma sequência fixa de etapas, com parâmetros versionados, **validação de dados** e um
**portão** antes do registro. Depois, o mesmo pipeline em **Kubeflow Pipelines v2**, o formato dos
AI Pipelines do OpenShift AI 3.5.
**Pré-requisito:** exemplos [01](../01-experimentos-com-mlflow/) e [02](../02-registro-e-promocao/). Teoria em [docs/01](../../docs/01-mlops-fundamentos.md) e [docs/04](../../docs/04-mlops-no-openshift-ai.md).

```
params.yaml         -> tudo o que define o treino (dados, modelo, critérios do portão)
pipeline.py         -> versão local: carregar -> validar -> treinar -> avaliar -> portão -> registrar
pipeline_kfp.py     -> mesma ideia em componentes KFP; compila para pipeline_kfp.yaml
rodar_kfp_local.py  -> executa o pipeline KFP na sua máquina, sem cluster (kfp.local)
```

## Como rodar

```bash
uv run python exemplos/05-pipeline-de-treino/pipeline.py; echo "exit=$?"
uv run --group kfp python exemplos/05-pipeline-de-treino/pipeline_kfp.py
uv run --group kfp python exemplos/05-pipeline-de-treino/rodar_kfp_local.py 10
```

## Saída esperada

Saídas reais (2026-10-13). Depois do exemplo 02, com o champion atual já sendo o melhor:

```
1. carregar   : 426 treino / 143 teste
2. validar    : ok
3. treinar    : {'tipo': 'LogisticRegression', 'C': 1.0}
4. avaliar    : recall_maligno=0.981 roc_auc=0.9977
5. portão     : REPROVADO (não supera o champion v1 (roc_auc 0.9977))
exit=0
```

Num banco vazio (sem champion):

```
5. portão     : APROVADO (sem champion atual)
6. registrar  : versão 1 agora é o champion
exit=0
```

Com `C: 10.0` no `params.yaml` (o portão de recall barra):

```
4. avaliar    : recall_maligno=0.943 roc_auc=0.9945
5. portão     : REPROVADO (recall_maligno 0.943 < mínimo 0.95)
exit=1
```

Pipeline KFP compilado e executado localmente:

```
compilado: pipeline_kfp.yaml (10709 bytes)

== C=1.0
Task 'carregar-e-validar' finished with status SUCCESS
Task 'treinar-e-avaliar' finished with status SUCCESS
    registrando o modelo em .../treinar-e-avaliar/modelo
Task 'registrar' finished with status SUCCESS
Pipeline 'cancer-clf-treino' finished with status SUCCESS
== C=10
Task 'carregar-e-validar' finished with status SUCCESS
Task 'treinar-e-avaliar' finished with status SUCCESS
Pipeline 'cancer-clf-treino' finished with status SUCCESS     <- "registrar" não rodou: o dsl.If barrou
```

**Não executado localmente:** importar o `pipeline_kfp.yaml` num OpenShift AI (Dashboard → Pipelines →
Import pipeline) e rodar no cluster.

## Experimente

1. Mude o `recall_maligno_minimo` para 0.99 e veja nenhum modelo passar.
2. Em `validar`, injete um valor negativo (`X_treino.iloc[0, 0] = -1`) e veja o pipeline parar no passo 2.
3. Abra o `pipeline_kfp.yaml` e ache o `condition-1`: é o seu portão, agora como parte do grafo.
