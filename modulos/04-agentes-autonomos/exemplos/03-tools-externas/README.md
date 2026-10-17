# Exemplo 03 · Tools externas: API REST, banco de dados e MCP

**Conceito novo**: o agente opera sistemas de verdade. Ele **cria**, **executa** e **ajusta** uma tarefa
usando três tipos de ferramenta externa no mesmo loop:

| Tool | Tipo | O que faz |
|---|---|---|
| `criar_tarefa`, `atualizar_tarefa` | banco de dados | SQL parametrizado em `m04.tarefas` (o modelo nunca escreve SQL) |
| `consultar_cotacao` | API REST | `GET http://127.0.0.1:30400/cotacao/USD` ([`api-rest.js`](api-rest.js), sobe e desce no script) |
| `notificar_time` | servidor MCP (automação) | descoberta em runtime com `listTools()`; o `inputSchema` vira schema da API OpenAI ([`mcp-automacoes.js`](mcp-automacoes.js)) |

O roteamento é simples: tool local → handler; senão → `mcp.callTool()`. O servidor MCP segue o padrão do
[módulo 03](../../../03-mcp/) (ver o exemplo [03-ponte-mcp-llm](../../../03-mcp/exemplos/03-ponte-mcp-llm/)),
mas aqui ele é só mais uma tool no meio de outras.

Teoria: [doc 02 · conectando o agente ao mundo](../../docs/02-tools-memoria-e-contexto.md#conectando-o-agente-ao-mundo).

**Pré-requisito**: [exemplo 01](../01-agent-loop-do-zero/), Postgres no ar (schema `m04`) e porta 30400 livre.

## Como rodar

```bash
cd modulos/04-agentes-autonomos
npm run ex03
```

O script recria `m04.tarefas` e `m04.notificacoes` a cada execução. ~6 chamadas ao LLM, ~4 min no CPU.

## Saída esperada

Saída real:

```
Ferramentas: criar_tarefa, atualizar_tarefa, consultar_cotacao, notificar_time
Pedido: Crie a tarefa "Monitorar dólar" e consulte a cotação do USD. Se passar de 5,30, ajuste a tarefa para prioridade alta e notifique o time financeiro. Por fim conclua a tarefa com a cotação como resultado.
[1] (51s) criar_tarefa({"titulo":"Monitorar dólar"}) -> {"id":1,"status":"aberta"}
[2] (32s) consultar_cotacao({"moeda":"USD"}) -> {"moeda":"USD","brl":5.42,"fonte":"api-local"}
[3] (41s) atualizar_tarefa({"id":1,"prioridade":"alta"}) -> {"id":1,"titulo":"Monitorar dólar","status":"aberta","prioridade":"alta","resultado":null}
[4] (44s) notificar_time({"time":"financeiro","mensagem":"A cotação do USD subiu para 5,42, ultrapassando o limite de 5,30. Ação necessária."}) -> {"mcp":true,"isError":false,"texto":"{\"ok\":true,\"id\":1,\"time\":\"financeiro\"}"}
[5] (36s) atualizar_tarefa({"id":1,"status":"concluida","resultado":"5,42"}) -> {"id":1,"titulo":"Monitorar dólar","status":"concluida","prioridade":"alta","resultado":"5,42"}

[6] resposta final (21s): A tarefa foi concluída com prioridade alta e o resultado da cotação de 5,42.

Estado final no banco:
┌─────────┬────┬───────────────────┬─────────────┬────────────┬───────────┐
│ (index) │ id │ titulo            │ status      │ prioridade │ resultado │
├─────────┼────┼───────────────────┼─────────────┼────────────┼───────────┤
│ 0       │ 1  │ 'Monitorar dólar' │ 'concluida' │ 'alta'     │ '5,42'    │
└─────────┴────┴───────────────────┴─────────────┴────────────┴───────────┘
┌─────────┬────┬──────────────┬──────────────────────────────────────────────────────────────────────────────────────┐
│ (index) │ id │ time         │ mensagem                                                                             │
├─────────┼────┼──────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
│ 0       │ 1  │ 'financeiro' │ 'A cotação do USD subiu para 5,42, ultrapassando o limite de 5,30. Ação necessária.' │
└─────────┴────┴──────────────┴──────────────────────────────────────────────────────────────────────────────────────┘
6 chamadas ao LLM · 5329 tokens de prompt · 374 de resposta · 225.5s no modelo
```

Repare no **ajuste**: o agente usou o resultado da API (5,42 > 5,30) para decidir mudar a prioridade e
notificar; e o `id` devolvido por `criar_tarefa` foi reaproveitado nas chamadas seguintes. Os ~900 tokens de
prompt por chamada são, em boa parte, as 4 tools reenviadas a cada passo.

## Experimente

1. Troque o limite do pedido para "Se passar de 6,00": o agente deve pular a notificação e a prioridade alta.
2. Peça "consulte a cotação do JPY": o `enum` do schema faz o modelo recusar ou a API devolver 404, e o erro
   volta como feedback.
3. No handler de `consultar_cotacao` (em `main.js`), troque `${PORTA}` por `30499` (porta sem serviço) e veja
   o `fetch failed` chegar ao modelo como `{ erro }`, sem derrubar o loop.
