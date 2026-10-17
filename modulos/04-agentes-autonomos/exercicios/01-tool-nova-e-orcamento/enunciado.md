# Exercício 01 · Tool nova e guardrail de orçamento

## Contexto

O agente do [exemplo 01](../../exemplos/01-agent-loop-do-zero/) só sabe consultar estoque e calcular.
O time de compras quer perguntar preços, e o financeiro exige um teto de gasto por execução: um agente
sem orçamento pode entrar em loop e queimar tokens (ou dinheiro, numa API paga).

## Requisitos

1. Adicione a tool `consultar_preco(produto)` com schema JSON (enum de produtos, `required`,
   `additionalProperties: false`) e handler. Reaproveite as tools do exemplo 01 por import.
2. Adicione ao loop um **guardrail de orçamento**: `{ chamadas, tokens }` máximos. A checagem acontece
   **antes** de cada chamada ao LLM; ao estourar, o agente para e devolve `{ resposta: null, motivo: 'orcamento' }`.
3. Some os tokens reais de `usage.total_tokens` (não estime).

## Critério de pronto

- "Quanto custam 3 monitores?" com orçamento folgado termina com `motivo: 'ok'` e a resposta contém 2700.
- O mesmo pedido com `chamadas: 1` termina com `motivo: 'orcamento'`, sem fazer a 2ª chamada.

## Dicas

- Tool nova = só mais uma entrada no objeto de ferramentas; o loop não muda.
- Por que checar antes e não depois? Porque depois da chamada o custo já foi pago.

## Solução

[`solucao/`](solucao/) · rodar a partir da pasta do módulo: `npm run exe01` (~2–3 min no CPU).

Saída real da solução:

```
== orçamento folgado ==
[passo 1] gasto até aqui: 1 chamadas, 522 tokens
  consultar_preco({"produto":"monitor"}) -> {"produto":"monitor","preco":900}
[passo 2] gasto até aqui: 2 chamadas, 1082 tokens
resultado: {
  resposta: '3 monitores custam 2700 reais.',
  motivo: 'ok',
  gasto: { chamadas: 2, tokens: 1082 }
}

== orçamento apertado (1 chamada) ==
[passo 1] gasto até aqui: 1 chamadas, 522 tokens
  consultar_preco({"produto":"monitor"}) -> {"produto":"monitor","preco":900}
[guardrail] orçamento estourado: {"chamadas":1,"tokens":522} (limite {"chamadas":1,"tokens":3000})
resultado: {
  resposta: null,
  motivo: 'orcamento',
  gasto: { chamadas: 1, tokens: 522 }
}

✅ tool nova usada e guardrail de orçamento funcionando
```
