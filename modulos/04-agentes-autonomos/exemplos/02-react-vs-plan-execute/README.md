# Exemplo 02 · ReAct × Plan-and-Execute (e o mesmo ReAct no LangChain)

**Conceito novo**: o mesmo problema resolvido por dois **padrões de raciocínio**, com números medidos.

| Arquivo | Padrão | Chamadas ao LLM |
|---|---|---|
| [`react.js`](react.js) | **ReAct**: "Pensamento:" (reasoning trace) + ação + observação, um passo por chamada | 1 por passo |
| [`plan-execute.js`](plan-execute.js) | **Plan-and-Execute** estilo ReWOO: o planner (LLM) escreve o plano com `#E1, #E2…`; o executor (código) roda tudo; replaneja 1 vez se falhar | 1 (+1 se replanejar) |
| [`react-langchain.js`](react-langchain.js) | **ReAct com framework**: `createAgent` do LangChain v1 (um grafo LangGraph por baixo), `ChatOpenAI` apontando para o Ollama | 1 por passo |

Tarefa: *"Quanto custa (R$) comprar só o que falta para mouse e monitor chegarem a 10 unidades em estoque
cada?"* · resposta certa: (10−7)×50 + (10−3)×900 = **6450**.

Teoria: [doc 01 · padrões de raciocínio](../../docs/01-arquitetura-e-padroes-de-raciocinio.md#padrões-de-raciocínio-e-execução).

**Pré-requisito**: [exemplo 01](../01-agent-loop-do-zero/).

## Como rodar

```bash
cd modulos/04-agentes-autonomos
npm run ex02            # ReAct manual x Plan-and-Execute + tabela (~4 min no CPU)
npm run ex02:langchain  # ReAct com LangChain createAgent (~4 min)
```

## Saída esperada

Saída real de `npm run ex02`:

```
Tarefa: Quanto custa (R$) comprar só o que falta para mouse e monitor chegarem a 10 unidades em estoque cada?
Resposta certa: 6450

=== ReAct (manual) ===
  [1] Pensamento: Para resolver essa tarefa, preciso primeiro descobrir quantas unidades de cada produto (mouse e monitor) já estão no estoque. ... | Primeiro passo: Consultar o estoque atual do mouse. (58s)
  [1] Ação: consultar_estoque({"produto":"mouse"}) -> Observação: {"valor":7}
  [2] Pensamento: O estoque atual de mouse é 7 unidades. Para chegar a 10 unidades, faltam 3 unidades (10 - 7 = 3). Agora preciso consultar o estoque do monitor. (24s)
  [2] Ação: consultar_estoque({"produto":"monitor"}) -> Observação: {"valor":3}
  [3] Pensamento: O estoque atual de monitor é 3 unidades. ... Primeiro passo: Consultar o preço unitário de compra do mouse. (29s)
  [3] Ação: consultar_preco({"produto":"mouse"}) -> Observação: {"valor":50}
  [4] Pensamento: O preço unitário de compra do mouse é R$ 50. Agora preciso consultar o preço unitário de compra do monitor. (26s)
  [4] Ação: consultar_preco({"produto":"monitor"}) -> Observação: {"valor":900}
  [5] Pensamento: Agora tenho todos os dados necessários para calcular o custo total: ... Vou calcular o custo total usando a expressão: (3 * 50) + (7 * 900) (39s)
  [5] Ação: calcular({"expressao":"(3*50)+(7*900)"}) -> Observação: {"valor":6450}
  [6] Resposta: 6450 (14s)
  resposta: Resposta: 6450

=== Plan-and-Execute ===
  planner (45s, tentativa 1): 5 passos
  executor E1: consultar_estoque({"produto":"mouse"}) = 7
  executor E2: consultar_estoque({"produto":"monitor"}) = 3
  executor E3: consultar_preco({"produto":"mouse"}) = 50
  executor E4: consultar_preco({"produto":"monitor"}) = 900
  executor E5: calcular({"expressao":"((10-7)*50)+(10-3)*900"}) = 6450
  resposta: Resposta: R$ 6450

Comparativo:
┌─────────┬────────────────────┬──────────┬──────────────┬────────┬──────────┬─────────┐
│ (index) │ estrategia         │ llmCalls │ chamadasTool │ tokens │ segundos │ acertou │
├─────────┼────────────────────┼──────────┼──────────────┼────────┼──────────┼─────────┤
│ 0       │ 'ReAct (manual)'   │ 6        │ 5            │ 5195   │ '190.1'  │ true    │
│ 1       │ 'Plan-and-Execute' │ 1        │ 5            │ 377    │ '45.0'   │ true    │
└─────────┴────────────────────┴──────────┴──────────────┴────────┴──────────┴─────────┘
```

(No passo E5 o executor já mostra a expressão com `#E1…#E4` substituídos pelos valores; o planner escreveu
`((10-#E1)*#E3)+(10-#E2)*#E4` sem conhecer os números.)

Saída real de `npm run ex02:langchain`:

```
=== ReAct (LangChain createAgent) ===
  tool consultar_estoque -> {"valor":7}
  tool consultar_estoque -> {"valor":3}
  tool consultar_preco -> {"valor":50}
  tool consultar_preco -> {"valor":900}
  tool calcular -> {"valor":6450}
  resposta: Resposta: 6450
┌─────────┬─────────────────────┬──────────┬──────────────┬──────────┬─────────┐
│ (index) │ estrategia          │ llmCalls │ chamadasTool │ segundos │ acertou │
├─────────┼─────────────────────┼──────────┼──────────────┼──────────┼─────────┤
│ 0       │ 'ReAct (LangChain)' │ 3        │ 5            │ '239.7'  │ true    │
└─────────┴─────────────────────┴──────────┴──────────────┴──────────┴─────────┘
```

### Como ler os números

- **Chamadas e tokens**: ReAct gastou 6 chamadas e ~5,2 mil tokens (o contexto cresce e é reenviado a cada
  passo); Plan-and-Execute, 1 chamada e 377 tokens, ~14× menos. O tempo acompanha (os segundos variam com a
  carga do Ollama; compare chamadas e tokens).
- **LangChain fez 3 chamadas** porque o modelo pediu as 4 consultas **em paralelo** num único passo (vários
  `tool_calls` na mesma resposta); o laço manual também aceitaria, mas o prompt do `react.js` induz um passo
  por vez.
- **Robustez**: na primeira versão deste exemplo (sem JSON mode e com solver LLM) os resultados reais foram
  piores e instrutivos: ReAct respondeu 9500 (esqueceu de consultar o estoque porque a tarefa dizia só
  "repor até 10"), o planner gerou JSON inválido, inventou uma tool `responder` e, quando o plano rodou,
  o solver LLM "reescreveu" 500 como 400. As correções aplicadas: tarefa sem ambiguidade, **one-shot** de
  plano no prompt, **JSON mode** (`response_format: json_object`) e **solver determinístico**.

## Experimente

1. Em `plan-execute.js`, remova o exemplo (one-shot) do `PROMPT_PLANNER` e rode de novo: observe com que
   frequência o planner erra o formato ou o uso de `#En` (a saída do planner é impressa quando falha).
2. Torne a tarefa dependente de uma observação ("se o mouse tiver menos de 5 unidades, compre 20; senão 10"):
   o ReAct se adapta; o plano fixo precisa de replanejamento.
3. Rode `npm run ex02:langchain` com `maxTokens: 80` em `react-langchain.js`: a resposta final é cortada no
   meio (foi o que aconteceu com 150 tokens numa execução em que o modelo resolveu explicar a conta).
