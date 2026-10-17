# Exemplo 06 · LangGraph: roteamento, retry, fallback, checkpoint, HITL, guardrails e auditoria

**Conceito novo**: o agente vira um **grafo de execução** explícito (LangGraph.js 1.5.0). Cada desvio que no
loop manual seria um `if` escondido vira nó ou aresta visível, testável e auditável.

```mermaid
flowchart LR
  S((START)) --> GE[guardrail_entrada]
  GE -->|fora do escopo| FB[fallback]
  GE -->|ok| C[classificar · LLM]
  C -->|saldo| CS[consultar_saldo<br/>retryPolicy 3x]
  C -->|transferência| H[aprovacao_humana<br/>interrupt]
  C -->|outro / limites| FB
  H -->|aprovar| T[transferir]
  H -->|rejeitar| FB
  CS --> E((END))
  T --> E
  FB --> E
```

| Recurso | Onde em [`grafo.js`](grafo.js) |
|---|---|
| Estado tipado com reducers (`passos`, `tokens` somam; `auditoria` concatena) | `Annotation.Root` |
| Roteamento determinístico | `rotaEntrada`, `rotaIntencao`, `rotaAprovacao` |
| Retry de falha transitória | `retryPolicy: { maxAttempts: 3 }` em `consultar_saldo` (a API falha 2x de propósito) |
| Fallback handler | nó `fallback`, que explica o motivo |
| Checkpoint | `compile({ checkpointer: new MemorySaver() })` + `thread_id` |
| Human-in-the-loop | `interrupt()` em `aprovacao_humana`; retomada com `new Command({ resume: 'aprovar' })` |
| Guardrails | escopo (regex de entrada), `maxPassos`, `orcamentoTokens`, `allowlist` de tools, `recursionLimit` |
| Monitoramento | `stream(..., { streamMode: 'updates' })`, `getState`, `getStateHistory` |
| Auditoria | eventos no estado gravados em `m04.auditoria` |

Teoria: [doc 03](../../docs/03-langgraph-observabilidade-e-limites.md).

**Pré-requisito**: exemplos [01](../01-agent-loop-do-zero/) e [02](../02-react-vs-plan-execute/); Postgres (schema `m04`).

## Como rodar

```bash
cd modulos/04-agentes-autonomos
npm run ex06
```

2 chamadas ao LLM (só o nó `classificar` usa o modelo; o cenário C não gasta nenhuma). ~10 s com o Ollama livre.

## Saída esperada

Saída real:

```
[A] consulta de saldo (API instável: 2 falhas, retryPolicy resolve)
  ✓ guardrail_entrada
  ↻ apiSaldo: 503 (simulado); o retryPolicy vai reexecutar o nó
  ✓ classificar
  ↻ apiSaldo: 503 (simulado); o retryPolicy vai reexecutar o nó
  ✓ consultar_saldo -> Saldo da conta 123: R$ 1500
  passos=3 tokens=100 resposta="Saldo da conta 123: R$ 1500"

[B] transferência (precisa de aprovação humana)
  ✓ guardrail_entrada
  ✓ classificar
  ⏸ interrupt: {"pergunta":"Aprovar transferência?","intencao":"transferencia","conta":"123","destino":"456","valor":200}
  grafo pausado; próximo nó: aprovacao_humana; checkpoints na thread: 4
  operador responde: aprovar
  ✓ aprovacao_humana
  ✓ transferir -> Transferidos R$ 200 de 123 para 456.
  passos=4 tokens=118 resposta="Transferidos R$ 200 de 123 para 456."

[C] pedido fora do escopo (guardrail de entrada, sem gastar LLM)
  ✓ guardrail_entrada
  ✓ fallback -> Não executei: pedido fora do escopo. Encaminhado para atendimento humano.
  passos=2 tokens=0 resposta="Não executei: pedido fora do escopo. Encaminhado para atendimento humano."

Trilha de auditoria (m04.auditoria):
┌─────────┬───────────┬─────────────────────┬──────────────────────────────┐
│ (index) │ thread_id │ no                  │ decisao                      │
├─────────┼───────────┼─────────────────────┼──────────────────────────────┤
│ 0       │ 'A'       │ 'guardrail_entrada' │ 'ok'                         │
│ 1       │ 'A'       │ 'classificar'       │ 'intencao=saldo'             │
│ 2       │ 'A'       │ 'consultar_saldo'   │ 'ok'                         │
│ 3       │ 'B'       │ 'guardrail_entrada' │ 'ok'                         │
│ 4       │ 'B'       │ 'classificar'       │ 'intencao=transferencia'     │
│ 5       │ 'B'       │ 'aprovacao_humana'  │ 'aprovar'                    │
│ 6       │ 'B'       │ 'transferir'        │ 'executado'                  │
│ 7       │ 'C'       │ 'guardrail_entrada' │ 'BLOQUEADO (fora do escopo)' │
│ 8       │ 'C'       │ 'fallback'          │ 'pedido fora do escopo'      │
└─────────┴───────────┴─────────────────────┴──────────────────────────────┘
2 chamadas ao LLM · 171 tokens de prompt · 47 de resposta · 10.2s no modelo
```

### O que observar

- A linha `↻` aparece **antes** de `✓ classificar`: o stream entrega o evento de um nó quando o *super-step*
  termina, e o nó seguinte já começou a rodar. Para correlacionar, use o `ts` da auditoria, não a ordem do console.
- As falhas que o retry absorveu **não aparecem na auditoria**: as atualizações de tentativas que falharam são
  descartadas. Se você precisa auditar retries, registre-os fora do estado (log/métrica).
- Em B, o grafo parou no `interrupt` com 4 checkpoints salvos; a retomada usou a mesma `thread_id` e só então
  `transferir` rodou. Num servidor real, a pausa pode durar dias (checkpointer persistente).

## Experimente

1. Responda `rejeitar` em vez de `aprovar` no cenário B: a rota vai para `fallback` ("operador negou").
2. Mude `LIMITES.orcamentoTokens` para `50`: depois de `classificar` (~100 tokens) o roteador manda para o fallback.
3. Troque `falhasRestantes` para `5`: o retry esgota as 3 tentativas e a exceção derruba a execução. Compare
   com o exercício 02, que captura a última falha e desvia para um fallback.
