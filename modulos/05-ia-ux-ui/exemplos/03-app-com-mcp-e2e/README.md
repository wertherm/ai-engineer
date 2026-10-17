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
