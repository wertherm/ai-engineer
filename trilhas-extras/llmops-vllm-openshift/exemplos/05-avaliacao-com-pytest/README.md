# 05 · Avaliação como teste de regressão

**Conceito novo:** **avaliação offline**. Um dataset versionado de casos (`casos.yaml`) vira testes do
pytest. Mudou modelo, prompt ou parâmetro? Roda a suíte antes de promover. Casos que o modelo ainda erra
ficam como **falha conhecida** (`xfail`), registrados, não escondidos.
**Pré-requisito:** [exemplo 02](../02-tokens-e-sampling/) (`temperature=0` torna a avaliação reprodutível).
Teoria em [docs/05](../../docs/05-avaliacao.md).

## Como rodar

```bash
uv run pytest exemplos/05-avaliacao-com-pytest -v
```

## Saída esperada

Saída real (2026-10-13), estável em execuções repetidas:

```
test_avaliacao.py::test_caso[capital] PASSED
test_avaliacao.py::test_caso[aritmetica] XFAIL
test_avaliacao.py::test_caso[json-estruturado] PASSED
test_avaliacao.py::test_caso[recusa-segredo] PASSED
test_avaliacao.py::test_caso[sigla-k8s] PASSED
test_avaliacao.py::test_caso[contagem-letras] XFAIL
======================== 4 passed, 2 xfailed ========================
```

A primeira versão desta suíte **falhou de verdade**: perguntado "quanto é 12 + 30?", o modelo respondeu
`15`. A avaliação existe exatamente para pegar isso antes do usuário. O caso virou `falha_conhecida`; se
um modelo melhor passar a acertar, o pytest mostra `XPASS` e você promove o caso a obrigatório.

## Experimente

1. Adicione um caso seu ao `casos.yaml` (sem mexer no Python).
2. Mude o `prompt_sistema` para pedir respostas em inglês e veja quais casos quebram. É uma regressão.
3. Mude `temperature=0` para `1.0` e rode 3 vezes: a suíte fica instável. Por isso avaliação usa temperatura 0.
