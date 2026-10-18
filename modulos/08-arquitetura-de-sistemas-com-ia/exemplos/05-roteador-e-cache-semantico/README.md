# 05 · Model Router + Model Tiering + Semantic Cache + Response Streaming

**Conceito novo:** cortar custo e latência **antes** do modelo: (1) **Semantic Cache** no pgvector serve paráfrases
de perguntas já respondidas; (2) o **Model Router** por intenção manda perguntas factuais para o tier barato e
analíticas para o caro (Model Tiering); (3) o tier caro responde com **streaming**, e medimos o TTFT. O relatório
compara com o contrafactual "tudo no tier caro, sem cache". Teoria em
[doc 03](../../docs/03-padroes-de-design-de-ia.md#roteamento-inteligente) e
[caching](../../docs/03-padroes-de-design-de-ia.md#caching-semantic-cache-prompt-cache-e-streaming).

Localmente os dois tiers são o **mesmo** `qwen3.5:4b`: mudam o prompt, o `max_tokens` e o **preço de tabela**
(fictício, configurável por `PRECOS`). Com um provedor real, troque para um modelo "mini" e um "flagship".

Arquivos: `roteador.js` (tiers + `rotear`), `cache.js` (`CacheSemantico`, tabela `m08.cache_semantico`), `main.js`.

**Pré-requisito:** [exemplo 04](../04-padroes-de-rag/) (embeddings com instrução).

## Como rodar

```bash
npm run ex05            # 3 chamadas ao LLM + 6 embeddings; limpa o cache no início
LIMIAR=0.75 npm run ex05   # limiar frouxo: "O que é CDB?" passa a receber a resposta do CDI (falso hit)
```

## Saída esperada

Saída real (respostas do stream encurtadas com `...`):

```text
[barato] CDI é o Certificado de Depósito Interbancário, a taxa de juros mais importante do Brasil e referência para diversos produtos financeiros.

[stream caro] *   **Antecipação de Recebíveis**: É uma venda à vista do crédito ... liquidez imediata ...
*   **Empréstimo com CCB**: Oferece dinheiro pronto para qualquer finalidade ... compromete o fluxo de caixa futuro via parcelamento.
*   **Vantagem da

[barato] CDB é um Certificado de Depósito Bancário, uma aplicação financeira que permite investir no banco com rentabilidade variável e isenção de imposto de renda para rendimentos até 201%.

pergunta                               | rota                            | sim   | ms    | ttft  | tokens | US$
---------------------------------------|---------------------------------|-------|-------|-------|--------|---------
O que é CDI?                           | barato (pergunta factual curta) | 0.000 | 33132 | 31666 | 40+29  | 0.000023
Compare antecipação de recebíveis e em | caro (intenção analítica)       | 0.508 | 63800 | 33098 | 70+120 | 0.002010
o que significa CDI?                   | cache (barato)                  | 0.961 | 643   | 643   | 0      | 0
Me explique rapidinho o que é o CDI    | cache (barato)                  | 0.918 | 496   | 496   | 0      | 0
O que é CDB?                           | barato (pergunta factual curta) | 0.791 | 13600 | 13215 | 41+40  | 0.000030
Compare a antecipação de recebíveis co | cache (caro)                    | 0.975 | 1225  | 1225  | 0      | 0

Preços de tabela (US$/1M tokens in/out): {"barato":{"in":0.15,"out":0.6},"caro":{"in":3,"out":15}}
Custo real (roteador + cache):        US$ 0.002064
Custo sem otimização (tudo no caro):  US$ 0.006408
Economia: 68%
```

Leituras: o cache respondeu em ~0,5–1 s (só o embedding) contra 13–64 s do modelo; o streaming do tier caro
mostrou o 1º token na metade do tempo total (TTFT 33 s × 64 s); "CDB" teve similaridade 0,791 com "CDI": com limiar
0,75 seria um **falso hit** (resposta errada servida com confiança). E o tier barato **alucinou** ("isenção ... até
201%"): tier barato é para pergunta de baixo risco, ou precisa de RAG/validação.

## Experimente

1. `LIMIAR=0.75 npm run ex05` e veja o falso hit do CDB.
2. Mude `versaoPrompt` em `cache.js` para `v2`: todo o cache antigo deixa de valer (invalidação por versão de prompt).
3. Acrescente a palavra "explique" aos sinais de complexidade em `roteador.js` e veja quantas perguntas sobem de tier.

## Versão Python

[`python/roteador.py`](python/roteador.py), [`python/cache.py`](python/cache.py) (tabela `m08.cache_semantico_py`) e
[`python/main.py`](python/main.py). O streaming usa `stream=True` com `stream_options={"include_usage": True}`: o
último chunk vem com `choices` vazio e o `usage` preenchido (por isso o `if chunk.choices` no laço).

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/05-roteador-e-cache-semantico/python/main.py              # 3 chamadas ao LLM + 6 embeddings
LIMIAR=0.75 uv run python exemplos/05-roteador-e-cache-semantico/python/main.py  # falso hit do CDB
```

**Saída esperada (Python)** — saída real:

```text
[barato] CDI é o Certificado de Depósito Interbancário, a taxa de juros mais importante do Brasil e referência para diversos produtos financeiros.

[stream caro] *   **Antecipação de Recebíveis**: É uma venda à vista do crédito que o cliente deve pagar, oferecendo liquidez imediata sem juros sobre o valor antecipado (apenas desconto por antecipação), mas exige um fluxo de caixa prévio de vendas confirmadas.
*   **Empréstimo com CCB**: Oferece dinheiro pronto para qualquer finalidade com taxas de juros competitivas e prazos flexíveis, ideal para investimentos ou expansão, mas exige garantia real e compromete o fluxo de caixa futuro via parcelamento.
*   **Vantagem da

[barato] CDB é um Certificado de Depósito Bancário, uma aplicação financeira que permite investir no banco com rentabilidade variável e isenção de imposto de renda para rendimentos até 201%.

pergunta                               | rota                            | sim   | ms    | ttft  | tokens | US$
---------------------------------------|---------------------------------|-------|-------|-------|--------|---------
O que é CDI?                           | barato (pergunta factual curta) | 0.000 | 6404  | 6244  | 40+29  | 0.000023
Compare antecipação de recebíveis e em | caro (intenção analítica)       | 0.508 | 32636 | 4483  | 70+120 | 0.002010
o que significa CDI?                   | cache (barato)                  | 0.961 | 451   | 451   | 0      | 0
Me explique rapidinho o que é o CDI    | cache (barato)                  | 0.918 | 446   | 446   | 0      | 0
O que é CDB?                           | barato (pergunta factual curta) | 0.791 | 10695 | 10405 | 41+40  | 0.000030
Compare a antecipação de recebíveis co | cache (caro)                    | 0.975 | 766   | 766   | 0      | 0

Preços de tabela (US$/1M tokens in/out): {"barato":{"in":0.15,"out":0.6},"caro":{"in":3,"out":15}}
Custo real (roteador + cache):        US$ 0.002064
Custo sem otimização (tudo no caro):  US$ 0.006408
Economia: 68%
```

Mesmas rotas, mesmas similaridades (0,961 · 0,918 · 0,791 · 0,975), mesmos tokens e a mesma economia de 68% do JS.
Aqui o TTFT do tier caro foi 4,5 s contra 32,6 s do total: o streaming mostra o 1º token muito antes do fim.
