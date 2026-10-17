# 06 · Avaliação de LLMs

## Objetivo

Montar uma **suíte de avaliação** que impeça uma versão pior de ir para produção, e saber quando usar
cada tipo de avaliação.

## Por que é diferente de teste de software

Uma função `soma(2, 2)` sempre devolve 4. Um LLM devolve **texto**, que pode estar certo de várias formas
e errado de várias formas. Por isso a avaliação combina:

| Tipo | Como funciona | Bom para | Limite |
|---|---|---|---|
| **Regras determinísticas** | contém / não contém, JSON válido, regex | formato, fatos curtos, segurança básica | não julga qualidade de texto livre |
| **Benchmarks** (lm-evaluation-harness) | tarefas acadêmicas padronizadas | comparar modelos | não reflete o seu caso de uso |
| **LLM-as-judge** | outro modelo dá nota à resposta | texto livre, tom, relevância | precisa ser calibrado com rótulos humanos |
| **Humana** | pessoas avaliam amostras | a referência final | cara e lenta |

Comece pelas **regras determinísticas sobre um dataset seu**. É o que o [exemplo 05](../exemplos/05-avaliacao-com-pytest/) faz.

## A suíte de regressão

```yaml
# casos.yaml: versionado no Git, junto com o prompt
prompt_sistema: "Você é um assistente técnico..."
casos:
  - id: capital
    pergunta: "Qual é a capital do Brasil? Responda só o nome da cidade."
    deve_conter: ["Brasília"]
  - id: aritmetica
    pergunta: "Quanto é 12 + 30? Responda só o número."
    deve_conter: ["42"]
    falha_conhecida: "o modelo de 0,5B erra aritmética simples"
```

Princípios:

1. **`temperature=0`** na avaliação: senão a suíte fica instável.
2. **Versione juntos** prompt, parâmetros e casos. O que vai para produção é o conjunto.
3. **Falhas conhecidas ficam registradas** (`xfail`), não apagadas. Quando um modelo melhor acertar, o `XPASS` avisa.
4. **Cada bug de produção vira um caso novo.** A suíte cresce com a realidade.

## Iterar prompt é experimento

O [exercício 01](../exercicios/01-classificador-de-sentimento/) mostra o ciclo: hipótese → mudança no
prompt → medir no dataset → manter ou descartar. Números reais com o Qwen2.5-0.5B:

| Versão do prompt | Acerto |
|---|---|
| v1 zero-shot | 4/6 |
| v2 + definições + few-shot | 4/6 |
| v3 + "na dúvida, neutro" + exemplos neutros no fim | 5/6 |
| decomposição "tem opinião? sim/não" | descartada: respondeu "sim" para tudo |

Sem medir, a v2 pareceria melhor que a v1, e não era.

## Ferramentas (versões de 2026-10)

| Ferramenta | Para quê |
|---|---|
| pytest + YAML (este repo) | regressão simples, sem dependência extra |
| promptfoo 0.124 | suíte declarativa em YAML; fala com o vLLM via `openai:chat:<modelo>` + `apiBaseUrl` |
| lm-evaluation-harness 0.4.13 | benchmarks acadêmicos contra um endpoint OpenAI-compatível |
| DeepEval 4.2 | métricas prontas, incluindo LLM-as-judge |
| GuideLLM 0.8 | desempenho (carga), não qualidade |

No **OpenShift AI 3.5**, a avaliação gerenciada migrou para o **EvalHub** (providers lm-eval e GuideLLM,
resultados no MLflow). O antigo `LMEvalJob` está deprecado.

## Armadilhas

- Avaliar "no olho" ou só com BLEU/ROUGE.
- LLM-as-judge sem calibrar contra notas humanas: o juiz também erra e tem viés.
- Dataset que só cobre o caminho feliz. Inclua recusas, formatos e casos adversariais.
- Achar que o resultado de um modelo vale para outro: troque o modelo, rode tudo de novo.

## Fontes

- Databricks, avaliação em LLMOps: https://docs.databricks.com/aws/en/machine-learning/mlops/llmops
- promptfoo com vLLM: https://www.promptfoo.dev/docs/providers/vllm/
- lm-evaluation-harness: https://github.com/EleutherAI/lm-evaluation-harness
- DeepEval: https://github.com/confident-ai/deepeval
- EvalHub (OpenShift AI 3.5): https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/evaluating_ai_systems/evaluating-llms-with-evalhub_evaluate
- pytest xfail: https://docs.pytest.org/en/stable/how-to/skipping.html
