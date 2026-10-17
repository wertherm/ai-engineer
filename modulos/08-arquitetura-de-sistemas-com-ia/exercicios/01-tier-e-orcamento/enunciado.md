# Exercício 01 · Um tier a mais e uma política de orçamento no roteador

## Contexto

O roteador do [exemplo 05](../../exemplos/05-roteador-e-cache-semantico/) tem dois tiers. O financeiro pediu duas
coisas: um tier **intermediário** (perguntas "explique/como funciona" não precisam do modelo caro) e a garantia de que
a conta mensal **nunca** passa do orçamento.

## Requisitos

1. Três tiers (`barato`, `medio`, `caro`) com preço por 1M de tokens de entrada/saída e `maxTokens`.
2. `tierIdeal(pergunta)` por intenção: analítica → caro; explicativa ou longa (> 15 palavras) → medio; resto → barato.
3. `rotear(pergunta, { gastoMesUSD }, politica)` com orçamento mensal e alerta em 80%:
   abaixo do alerta → tier ideal; entre 80% e 100% → **desce um degrau**; a partir de 100% → recusa (`tier: null`).
4. Uma simulação determinística (semente fixa) de 30 mil pedidos (60% simples, 30% médios, 10% complexos), sem LLM,
   comparando "tudo no caro", "só tier ideal" e "ideal + orçamento".
5. Testes com `node:test`.

## Critério de pronto

- Testes passam; na simulação, "ideal + orçamento" termina **abaixo** do orçamento sem recusar ninguém.

## Dicas

- A política é dado (`POLITICA_PADRAO`), não `if` espalhado: assim ela pode vir de um arquivo versionado.
- Use um gerador congruencial linear com semente para a simulação ser reproduzível.

## Solução

[`solucao/roteador.js`](solucao/roteador.js), [`solucao/simulacao.js`](solucao/simulacao.js),
[`solucao/roteador.test.js`](solucao/roteador.test.js). Rode com `npm run exe01`. Saída real:

```text
Orçamento: US$ 5/mês · alerta em 80% · 30000 pedidos
┌─────────┬─────────────────────┬──────────┬───────────┬────────┬───────┬───────┐
│ (index) │ politica            │ gastoUSD │ recusados │ barato │ medio │ caro  │
├─────────┼─────────────────────┼──────────┼───────────┼────────┼───────┼───────┤
│ 0       │ 'tudo no caro'      │ '48.60'  │ 0         │ 0      │ 0     │ 30000 │
│ 1       │ 'só tier ideal'     │ '7.67'   │ 0         │ 18259  │ 8680  │ 3061  │
│ 2       │ 'ideal + orçamento' │ '4.73'   │ 0         │ 22427  │ 5973  │ 1600  │
└─────────┴─────────────────────┴──────────┴───────────┴────────┴───────┴───────┘
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

Só o roteamento por intenção corta 84% do custo; a política de orçamento segura a conta em 95% do teto
rebaixando um degrau a partir de 80%, em vez de recusar pedidos no fim do mês.
