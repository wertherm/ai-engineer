# Exemplo 03 · App com MCP para testes E2E por agente (+ UI interativa via MCP Apps/MCP-UI)

**Conceito novo:** a aplicação expõe o próprio **servidor MCP** (estado e ações) e um **recurso de UI** `ui://`
(padrão MCP Apps, criado com `@mcp-ui/server`). Um **agente** lê as tools, planeja um teste E2E a partir de um
objetivo em português e um executor determinístico o cumpre: Playwright na tela (por rótulos acessíveis) e MCP
para preparar e conferir o estado.

**Pré-requisito:** [exemplo 02](../02-ideia-ao-componente-testavel/) e o [módulo 03](../../../03-mcp/) (servidor MCP
HTTP com token). Os padrões de agente estão no [módulo 04](../../../04-agentes-autonomos/).

## Arquivos

| Arquivo | Papel |
|---|---|
| [`estado.js`](estado.js) | Estado em memória compartilhado por UI e MCP |
| [`index.html`](index.html) | UI de tarefas com `<label>`, `role="status"` e `aria-live` (o "contrato" dos agentes) |
| [`mcp.js`](mcp.js) | Tools `listar_tarefas`, `adicionar_tarefa`, `concluir_tarefa`, `resetar_estado`, `mostrar_painel` + recurso `ui://tarefas/painel`; gancho `extras` |
| [`painel.js`](painel.js) | HTML do recurso de UI: botões que mandam `tools/call` (JSON-RPC) por `postMessage` |
| [`app.js`](app.js) | Express: UI + API REST + `POST /mcp` (Streamable HTTP stateless, Bearer token) |
| [`cliente-mcp.js`](cliente-mcp.js) | Cliente MCP HTTP e a **mini-host** que renderiza o recurso num iframe sandbox |
| [`e2e.test.js`](e2e.test.js) | E2E determinístico (sem LLM): token, fluxo UI+MCP e recurso de UI |
| [`agente-e2e.js`](agente-e2e.js) | Agente: objetivo → plano (saída estruturada + validação) → execução |
| [`server.js`](server.js) | Sobe a app para uso manual na porta 30510 |

## Como rodar

```bash
cd modulos/05-ia-ux-ui
node --test "exemplos/03-app-com-mcp-e2e/*.test.js"   # sem LLM, ~7 s (porta 30511)
npm run ex03                                          # agente (1 ou 2 chamadas ao LLM; porta 30510)
npm run ex03 -- "Adicione duas tarefas pela tela e confira pelo MCP que existem duas"
npm run ex03:server                                   # manual: http://127.0.0.1:30510 (MCP: Bearer tok-e2e-demo)
```

## Saída esperada

E2E determinístico (saída real):

```
✔ MCP exige token (1847.505896ms)
✔ adicionar e concluir pela UI, conferindo pelo MCP (1931.789172ms)
✔ recurso de UI (MCP Apps) é anunciado e age via tools/call (1644.797965ms)
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

Agente, com o código atual (saída real):

```
Objetivo: Partindo de uma lista vazia, adicione pela interface a tarefa "Pagar boleto", confirme pelo MCP que ela existe, marque-a como concluída pela interface e confirme pelo MCP que ficou concluída.
Tools MCP descobertas: listar_tarefas, adicionar_tarefa, concluir_tarefa, resetar_estado, mostrar_painel

Plano do LLM, tentativa 1 (1734s):
  1. mcp "resetar_estado" "{}"
  2. preencher "Nova tarefa" "Pagar boleto"
  3. clicar "Adicionar" 
  4. verificar "listar_tarefas" "Pagar boleto"
  5. marcar "Pagar boleto" 
  6. verificar "listar_tarefas" "\"titulo\":\"Pagar boleto\",\"concluida\":true"
  passo 1 (mcp resetar_estado): ok
  passo 2 (preencher Nova tarefa): ok
  passo 3 (clicar Adicionar): ok
  passo 4 (verificar listar_tarefas): ok
  passo 5 (marcar Pagar boleto): ok
  passo 6 (verificar listar_tarefas): ok

Estado final (via MCP): [{"id":1,"titulo":"Pagar boleto","concluida":true}]
Resultado: fluxo E2E aprovado
```

Os 1734 s são quase todos fila no Ollama compartilhado; o plano em si custa ~150 tokens.

### Como chegamos aqui (execuções registradas)

- [`execucao-registrada-1.txt`](execucao-registrada-1.txt): sem exemplo no prompt, o modelo pôs o **texto
  esperado no campo da tool** (`verificar "Pagar boleto"`) e o executor tentou chamar a tool "Pagar boleto"
  (`MCP error -32602: Tool Pagar boleto not found`). Correção: **few-shot** (um plano de exemplo para outro
  objetivo) e **validação semântica** do plano, com uma 2ª chamada mandando os erros ao modelo.
- [`execucao-registrada-2.txt`](execucao-registrada-2.txt): o plano veio certo nos campos, mas a verificação falhou
  com `esperava "Pagar boleto" em [{"id":1,"titulo":"Pagar boleto",...}]`. **O bug era do executor**: ele tirava os
  espaços só do valor esperado ("Pagarboleto"). Também apareceram passos inúteis (preencher vazio + clicar).
  Correção: normalizar os dois lados e rejeitar `preencher`/`verificar` sem `valor`.

Lição: quando o teste por agente falha, investigue as três camadas (plano do LLM, executor, aplicação) antes de
culpar o modelo. O estado final via MCP mostrava que a **aplicação** estava certa nas duas execuções.

## Experimente

1. Abra a app (`npm run ex03:server`), mude o `<label for="titulo">` para um `placeholder` e rode o E2E: o
   `getByLabel` deixa de achar o campo. Acessibilidade e "dirigibilidade por agente" são a mesma coisa.
2. Conecte um host MCP Apps de verdade (ex.: MCPJam ou o `basic-host` do `@modelcontextprotocol/ext-apps`) em
   `http://127.0.0.1:30510/mcp` com o header `Authorization: Bearer tok-e2e-demo` e chame `mostrar_painel`.
3. Configure o servidor no Gemini CLI com o [`settings.json`](../02-ideia-ao-componente-testavel/gemini/.gemini/settings.json)
   do exemplo 02 e peça "liste minhas tarefas pendentes" (exige login).

## Versão Python

O que roda no navegador (`index.html` e o `<script>` do painel) é o mesmo; o que roda no Node virou Python:

| Arquivo | Papel |
|---|---|
| [`python/estado.py`](python/estado.py) | Estado em memória (com `threading.Lock`: o uvicorn roda numa thread) |
| [`python/mcp_app.py`](python/mcp_app.py) | Tools com o SDK `mcp` 2.3.0 (`MCPServer`, `@mcp.tool`, `ToolError` → `isError`) + recurso `ui://tarefas/painel` pela extensão **`mcp.server.apps.Apps`** do próprio SDK; gancho `extras` |
| [`python/painel.py`](python/painel.py) | HTML do recurso de UI (gerado no servidor; o `<script>` dele continua JS) |
| [`python/app.py`](python/app.py) | **FastAPI**: UI + API REST + app Streamable HTTP do MCP montado atrás de um middleware ASGI de Bearer token |
| [`python/cliente_mcp.py`](python/cliente_mcp.py) | `Client` + `streamable_http_client(url, http_client=httpx2.AsyncClient(headers=...))` e a mini-host (`page.expose_function` + iframe sandbox) |
| [`python/test_e2e.py`](python/test_e2e.py) | E2E determinístico em pytest (anyio) + Playwright async, porta 30551 |
| [`python/agente_e2e.py`](python/agente_e2e.py) | Agente plan-and-execute: `chat.completions.parse(response_format=Plano)` (pydantic) + validação semântica + executor (porta 30550) |
| [`python/server.py`](python/server.py) | Sobe a app para uso manual na porta 30550 |

**MCP-UI em Python:** existe o pacote `mcp-ui-server` (1.0.0, de 04/11/2025, mcpui.dev), mas ele gera o recurso como
`text/html` (MCP-UI antigo, não o perfil MCP Apps) e **nem funciona com o `mcp` 2.x**: `create_ui_resource` falha com
`Input should be a valid string [type=string_type, input_value=AnyUrl('ui://x')]`. Não precisou: o SDK `mcp` 2.3.0 traz
a extensão MCP Apps em `mcp.server.apps` (`Apps`, `APP_MIME_TYPE = "text/html;profile=mcp-app"`, `@apps.tool(resource_uri=...)`
grava `_meta.ui.resourceUri`). Como o painel reflete o estado, o recurso é um `FunctionResource` (HTML montado a cada
`resources/read`) registrado com `apps.add_resource(...)`.

**Montagem FastAPI + MCP:** app montado não roda o próprio lifespan, então o `mcp.session_manager.run()` entra no
lifespan do FastAPI; as rotas `/` e `/api/*` vêm antes e o `app.mount("/", ...)` do MCP fica por último.

**Como rodar** (da pasta do módulo):

```bash
uv run pytest exemplos/03-app-com-mcp-e2e/python -vv                # sem LLM (~6 s, porta 30551)
uv run python exemplos/03-app-com-mcp-e2e/python/agente_e2e.py       # agente (1 ou 2 chamadas; porta 30550)
uv run python exemplos/03-app-com-mcp-e2e/python/server.py           # manual: http://127.0.0.1:30550 (Bearer tok-e2e-demo)
```

**Saída esperada (Python)** (saída real). E2E:

```
test_mcp_exige_token PASSED [ 33%]
test_adicionar_e_concluir_pela_ui_conferindo_pelo_mcp PASSED [ 66%]
test_recurso_de_ui_mcp_apps_e_anunciado_e_age_via_tools_call PASSED [100%]
============================== 3 passed in 6.06s ===============================
```

Agente (a execução real ainda imprimia linhas `HTTP Request: POST ...` e `StreamableHTTP session manager started`,
omitidas aqui; a causa era o `MCPServer` com `log_level` default `INFO`, que configura o logging raiz, e o código já
passa `log_level="WARNING"`):

```
Objetivo: Partindo de uma lista vazia, adicione pela interface a tarefa "Pagar boleto", confirme pelo MCP que ela existe, marque-a como concluída pela interface e confirme pelo MCP que ficou concluída.
Tools MCP descobertas: mostrar_painel, listar_tarefas, adicionar_tarefa, concluir_tarefa, resetar_estado

Plano do LLM, tentativa 1 (145s):
  1. mcp "resetar_estado" "{}"
  2. preencher "Nova tarefa" "Pagar boleto"
  3. clicar "Adicionar" 
  4. verificar "listar_tarefas" "Pagar boleto"
  5. marcar "Pagar boleto" 
  6. verificar "listar_tarefas" "\"titulo\":\"Pagar boleto\",\"concluida\":true"
  passo 1 (mcp resetar_estado): ok
  passo 2 (preencher Nova tarefa): ok
  passo 3 (clicar Adicionar): ok
  passo 4 (verificar listar_tarefas): ok
  passo 5 (marcar Pagar boleto): ok
  passo 6 (verificar listar_tarefas): ok

Estado final (via MCP): [{"id":1,"titulo":"Pagar boleto","concluida":true}]
Resultado: fluxo E2E aprovado
```

O plano saiu igual ao do JS, mesmo com o catálogo de tools em outra ordem (as tools da extensão `Apps` são registradas
primeiro, então `mostrar_painel` vem na frente).
