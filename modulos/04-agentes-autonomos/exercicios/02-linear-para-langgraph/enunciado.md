# Exercício 02 · Do agente linear ao grafo LangGraph com fallback

## Contexto

[`inicial/linear.js`](inicial/linear.js) é um agente de pedidos escrito como uma sequência de `await`s:
o LLM extrai produto, quantidade e CEP; depois uma API calcula o frete. Funciona no caminho feliz, mas:

- se a API de frete cair, a execução inteira explode;
- se o LLM extrair um CEP inválido (ou não houver CEP), segue adiante com lixo;
- não dá para ver por quais etapas a execução passou.

Rode o ponto de partida: `npm run exe02:inicial`.

## Requisitos

Reescreva como grafo LangGraph.js (`StateGraph` + `Annotation.Root`) com os nós:

1. `extrair` (LLM) → `validar` (código: CEP com 8 dígitos, quantidade > 0).
2. Aresta condicional: inválido → `fallback` (resposta honesta, encaminha a um atendente).
3. `calcular_frete` com `retryPolicy` de 3 tentativas. Se ainda falhar, **não derrube o grafo**: vá para
   `frete_padrao` (R$ 50) e depois `responder`, deixando claro na resposta que o frete veio do fallback.
4. Um campo `trilha` no estado com reducer de concatenação, registrando cada nó executado.

## Critério de pronto

Três casos com `assert`:

| Caso | Caminho esperado |
|---|---|
| API ok, CEP 01310-100 | extrair → validar → calcular_frete → responder (frete R$ 25, origem api) |
| API fora do ar | extrair → validar → calcular_frete ×3 → frete_padrao → responder |
| "Quero 5 mesas" (sem CEP) | extrair → validar → fallback |

## Dicas

- Exceção lançada dentro do nó aciona o `retryPolicy`; se a última tentativa também lançar, o erro sobe e o
  `invoke` falha. Para cair no fallback, capture na última tentativa e grave `erro` no estado.
- O roteador (`addConditionalEdges`) deve ser uma função pura do estado: fácil de testar sem LLM.
- `jitter: false` e `initialInterval` baixo deixam o teste rápido e determinístico.

## Solução

[`solucao/grafo.js`](solucao/grafo.js) + [`solucao/main.js`](solucao/main.js) · rodar a partir da pasta do
módulo: `npm run exe02` (3 chamadas ao LLM, ~2–4 min no CPU).

Saída real da solução:

```
[API ok] extrair -> validar -> calcular_frete#1 -> responder
  2x cadeiras, frete R$ 25 (api)
[API fora do ar] extrair -> validar -> calcular_frete#3(falhou) -> frete_padrao -> responder
  2x cadeiras, frete R$ 50 (tabela padrão (fallback))
[pedido sem CEP] extrair -> validar(CEP inválido) -> fallback
  Não consegui entender o pedido (CEP inválido). Um atendente vai assumir.

✅ 3 caminhos do grafo verificados · 3 chamadas ao LLM · 183 tokens de prompt · 61 de resposta · 12.6s no modelo
```

Repare que a trilha mostra só `calcular_frete#3(falhou)`: as atualizações de estado das tentativas que
lançaram exceção são descartadas pelo LangGraph; só a tentativa que retornou entra no estado.

## Versão Python

- Ponto de partida: [`inicial/python/linear.py`](inicial/python/linear.py) ·
  `uv run python exercicios/02-linear-para-langgraph/inicial/python/linear.py` → saída real: `2x cadeiras, frete R$ 25`.
- Solução: [`solucao/python/grafo.py`](solucao/python/grafo.py) + [`solucao/python/main.py`](solucao/python/main.py)
  · `uv run python exercicios/02-linear-para-langgraph/solucao/python/main.py`.

Diferença idiomática: o LangGraph **Python** 1.2 tem `add_node(..., error_handler=...)`. Em vez de capturar a
exceção na última tentativa (a dica acima, que é o caminho no JS), `calcular_frete` só lança; esgotadas as 3
tentativas do `RetryPolicy`, o handler `frete_falhou(state, error: NodeError)` grava o erro e a trilha e devolve
`Command(goto="frete_padrao")`. A falha simulada é `FreteIndisponivel(ConnectionError)`: o `retry_on` padrão do
Python retenta `ConnectionError`, mas **não** retentaria um `ValueError`/`RuntimeError`. O CEP é limpo com
`re.sub(r"\D", "", ..., flags=re.ASCII)` (sem `re.ASCII`, `\D` deixaria passar dígitos não ASCII).

Saída real da solução Python:

```
[API ok] extrair -> validar -> calcular_frete#1 -> responder
  2x cadeiras, frete R$ 25 (api)
[API fora do ar] extrair -> validar -> calcular_frete#3(falhou) -> frete_padrao -> responder
  2x cadeiras, frete R$ 50 (tabela padrão (fallback))
[pedido sem CEP] extrair -> validar(CEP inválido) -> fallback
  Não consegui entender o pedido (CEP inválido). Um atendente vai assumir.

✅ 3 caminhos do grafo verificados · 3 chamadas ao LLM · 183 tokens de prompt · 61 de resposta · 18.5s no modelo
```
