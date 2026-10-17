# 10 · Servindo o modelo via REST

**Conceito novo:** **serving** de um modelo clássico. O MLflow sobe uma API (`/invocations`) a partir de
`models:/cancer-clf@champion`, e a **assinatura** logada no exemplo 01 valida o payload antes de chegar ao
modelo. É o mesmo papel que o vLLM faz para LLMs ([exemplo 01 da trilha de LLMOps](../../../llmops-vllm-openshift/exemplos/01-primeira-chamada/)).
**Pré-requisito:** [exemplo 02](../02-registro-e-promocao/). Teoria em [docs/02](../../docs/02-experimentos-registro-e-serving.md).

## Como rodar

```bash
bash exemplos/03-servindo-o-modelo/servir.sh            # terminal 1 (porta 5001)
uv run python exemplos/03-servindo-o-modelo/chamar.py   # terminal 2
```

Com curl (`dataframe_records` = lista de dicionários coluna → valor):

```bash
curl -s localhost:5001/invocations -H 'Content-Type: application/json' \
  -d '{"dataframe_records": [{"mean radius": 17.99, "mean texture": 10.38, ...as 30 colunas...}]}'
# {"predictions": [0]}
```

## Saída esperada

Saída real (2026-10-13):

```
ping: 200
previsões: [0, 0, 1, 1] | real: [0, 0, 1, 1] (0 = maligno)
sem a coluna 'mean radius' -> HTTP 400 INVALID_PARAMETER_VALUE: Model is missing inputs ['mean radius'].
```

O que observar:
- **`--env-manager local`**: o padrão (`virtualenv`) recria o ambiente do modelo e exige `pyenv`
  (`MlflowException: Could not find the pyenv binary`). Para estudo, `local` usa o Python atual.
- **A assinatura barra o payload errado com 400**, em vez de o modelo devolver lixo.
- **Content-Type errado dá 415** (`Unsupported Media Type`): o servidor aceita `application/json`, `text/csv` e parquet.
- Prefira `dataframe_split` a `dataframe_records`: a doc avisa que o segundo não garante a ordem das colunas.

## Experimente

1. Promova outra versão a `champion` (exemplo 02) e reinicie o `servir.sh`: a API passa a servir a versão nova sem mudar código.
2. Mande `"mean radius": "grande"` (texto) e veja a validação de tipo.
3. Compare com o [exemplo 01 da trilha de LLMOps](../../../llmops-vllm-openshift/exemplos/01-primeira-chamada/): o que muda entre servir um LLM e um classificador?
