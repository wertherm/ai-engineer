# Exercício 02 · Nova tool MCP na aplicação + teste E2E que a usa

## Contexto

A app de tarefas do [exemplo 03](../../exemplos/03-app-com-mcp-e2e/) expõe o estado por MCP. O time de QA quer
conferir cenários com filtro ("só as pendentes", "as que falam de café") sem baixar a lista inteira e filtrar no
teste. Você vai adicionar a tool e um E2E que a usa, **sem editar o exemplo 03**.

## Requisitos

1. Tool `buscar_tarefas` com `inputSchema` zod: `texto` (string opcional, até 80 caracteres) e `concluida`
   (boolean opcional). Sem filtros, devolve todas. A busca por texto ignora maiúsculas e acentos ("cafe" acha "Café").
2. Marque a tool como somente leitura (`annotations.readOnlyHint: true`).
3. Registre-a pelo gancho `criarApp(estado, { extrasMcp })` do exemplo 03.
4. Teste E2E (`node:test`) na porta 30530 que:
   - confere que a tool aparece no `tools/list` com os dois parâmetros;
   - cria 3 tarefas **pela UI** (Playwright, `getByLabel`/`getByRole`) e conclui 1 **pela UI**;
   - confere pelo MCP os filtros por texto, por status e combinados;
   - confere que argumento inválido (`concluida: "sim"`) volta com `isError`.

## Critério de pronto

`node --test exercicios/02-tool-mcp-e-teste-e2e/solucao/e2e.test.js` passa 3/3, sem LLM e sem tocar em `exemplos/`.

## Dicas

- `s.normalize('NFD').replace(/\p{Diacritic}/gu, '')` remove acentos.
- Depois de clicar em "Adicionar", espere o item aparecer (`getByLabel(titulo).waitFor()`) antes do próximo.
- Argumento inválido não lança exceção no cliente: o SDK devolve `{ isError: true }` com a mensagem do zod.

## Solução

[`solucao/tool-buscar.js`](solucao/tool-buscar.js) e [`solucao/e2e.test.js`](solucao/e2e.test.js).

```bash
npm run exe02
```

Saída real:

```
✔ a tool nova aparece no tools/list com schema e é somente leitura (1417.040913ms)
✔ UI cria e conclui; MCP filtra por texto e status (1986.440879ms)
✔ entrada inválida é recusada pelo schema (sem tocar no estado) (21.403487ms)
ℹ tests 3
ℹ pass 3
ℹ fail 0
```
