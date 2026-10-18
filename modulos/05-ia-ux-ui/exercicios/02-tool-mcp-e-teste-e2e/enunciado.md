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

## Versão Python

[`solucao/python/tool_buscar.py`](solucao/python/tool_buscar.py) (tool com o SDK `mcp` 2.3.0, registrada pelo gancho
`criar_app(estado, extras_mcp=...)` do [exemplo 03 em Python](../../exemplos/03-app-com-mcp-e2e/python/)) e
[`solucao/python/test_e2e.py`](solucao/python/test_e2e.py) (pytest + Playwright async + cliente MCP, porta 30570).

Diferenças em relação ao JS:

- O schema vem das anotações de tipo: `texto: Annotated[str | None, Field(max_length=80)] = None` e
  `concluida: Annotated[bool | None, Field(strict=True)] = None`. Sem `strict=True` o pydantic aceitaria `"true"`,
  `"yes"` e `"1"` como booleano (o zod do JS recusa); `"sim"` é recusado nos dois modos.
- Acentos: `unicodedata.normalize("NFD", s)` e descartar `unicodedata.combining(c)` (equivale ao `\p{Diacritic}`).
- `@mcp.tool(..., structured_output=False)` devolve só o texto JSON, como o JS.

**Como rodar** (da pasta do módulo, sem LLM):

```bash
uv run pytest exercicios/02-tool-mcp-e-teste-e2e -vv
```

**Saída esperada (Python)** (saída real, encurtada):

```
test_a_tool_nova_aparece_no_tools_list_com_schema_e_e_somente_leitura PASSED [ 33%]
test_ui_cria_e_conclui_mcp_filtra_por_texto_e_status PASSED [ 66%]
test_entrada_invalida_e_recusada_pelo_schema_sem_tocar_no_estado PASSED [100%]
============================== 3 passed in 6.05s ===============================
```
