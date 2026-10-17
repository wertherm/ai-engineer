# 02 · Tokens e sampling

**Conceito novo:** o modelo não lê palavras, lê **tokens**. E a escolha do próximo token é controlada por
**sampling** (`temperature`, `top_p`, `seed`). `max_tokens` corta a resposta.
**Pré-requisito:** [exemplo 01](../01-primeira-chamada/). Teoria em [docs/02](../../docs/02-fundamentos-de-llm.md).

## Como rodar

```bash
uv run python exemplos/02-tokens-e-sampling/tokens_e_sampling.py
```

## Saída esperada

Saída real (2026-10-13). As linhas de `temperature=1.2` usam `seed` fixa, então também se repetem:

```
== 1. Tokens ==
'Kubernetes' -> 2 tokens: ['K', 'ubernetes']
'OpenShift orquestra containers.' -> 7 tokens: ['Open', 'Shift', ' or', 'que', 'stra', ' containers', '.']
'paralelepípedo' -> 5 tokens: ['par', 'ale', 'lep', 'í', 'pedo']

== 2. temperature=0 (3 vezes) ==
   "Zephyr" - Este nome é inspirado em "zephyr", que significa vento ou brisa em
   "Zephyr" - Este nome é inspirado em "zephyr", que significa vento ou brisa em
   "Zephyr" - Este nome é inspirado em "zephyr", que significa vento ou brisa em

== 2. temperature=1.2 (3 vezes) ==
   "Zephyr" - Esta é uma abreviação do termo inglês "Zealot", que significa l
   Nome: Fido Gatinho  Explicação: Fido é uma palavra de origem chinesa que significa
   "Puffy Purrfectly Fine" - Este é o meu primeiro nome inventado para um gato, inspirado

== 3. max_tokens=5 ==
   '"Zephyr"'  finish_reason=length
```

O que observar:
- **Português gasta mais tokens que inglês** (`orquestra` virou 3 tokens). Mais tokens = mais custo e mais contexto ocupado.
- `temperature=0` é **determinístico**: use em avaliação e em tarefas de extração.
- Com temperatura alta o modelo **inventa com confiança** ("Fido é de origem chinesa"). Isso é alucinação.
- `finish_reason=length` avisa que a resposta foi cortada. Em produção, monitore a frequência disso.

## Experimente

1. Tokenize a mesma frase em inglês e em português e compare as contagens.
2. Rode a parte de `temperature=1.2` sem `seed` duas vezes: as respostas mudam.
3. Adicione `top_p=0.1` com `temperature=1.2` e veja a variedade cair.
