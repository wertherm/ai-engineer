# Exemplo 01 · Servidor MCP do zero via stdio + client em JS

**Conceito novo:** as três primitivas do servidor (tools, resources, prompts) e o client oficial que se conecta
por stdio, faz o handshake e lista/chama tudo.

**Pré-requisito:** `npm install` na pasta do módulo. Não usa Postgres nem Ollama.

- `server.js`: `McpServer` com `registerTool` (2 tools com schema zod, uma com `outputSchema`),
  `registerResource` (fixo e template `saudacao://{nome}`) e `registerPrompt`.
- `client.js`: sobe o servidor como processo filho (`StdioClientTransport`) e usa `listTools`, `callTool`,
  `listResources`, `listResourceTemplates`, `readResource`, `listPrompts` e `getPrompt`.

## Como rodar

```bash
cd modulos/03-mcp
npm run ex01        # ou: node exemplos/01-servidor-stdio/client.js
```

## Saída esperada

```text
Servidor: { name: 'ola-mcp', version: '1.0.0' }
Capabilities: prompts, resources, tools

Tools:
- somar: Soma dois números | schema: {"a":{"type":"number"},"b":{"type":"number"}}
- dia_da_semana: Diz o dia da semana de uma data ISO (AAAA-MM-DD) | schema: {"data":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"}}

somar(2, 40) -> 42 | structuredContent: {"resultado":42}
dia_da_semana -> 2026-10-16 cai numa sexta-feira
somar("dois", 1) -> isError: true | MCP error -32602: Input validation error: Invalid arguments for tool somar: Inva

Resources: info://sobre | templates: saudacao://{nome}
info://sobre -> {"empresa":"Exemplo SA","versao":"1.0.0"}
saudacao://Werther -> Olá, Werther! Bem-vindo ao MCP.

Prompts: revisar_codigo(codigo)
revisar_codigo -> "Revise este código e aponte bugs:\n\nlet x = 1"
```

Repare: argumento inválido **não** lança exceção no client; volta como resultado com `isError: true`, que é o
que o LLM precisa ver para corrigir a chamada.

## Experimente

1. Troque um `console.error` do `server.js` por `console.log` e rode de novo: o client quebra, porque o stdout é o canal JSON-RPC.
2. Adicione uma tool `converter_moeda` com `inputSchema: { valor: z.number().positive(), para: z.enum(['USD', 'EUR']) }` e chame-a no client.
3. Rode o servidor no Inspector CLI: `npx -y @modelcontextprotocol/inspector@2.11.0 --cli node exemplos/01-servidor-stdio/server.js --method prompts/list`.
