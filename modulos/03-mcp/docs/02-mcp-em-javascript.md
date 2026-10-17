# 02 · MCP em JavaScript/TypeScript: criar, consumir, testar e configurar em clients

## Objetivo

Criar servidores e clients MCP com o SDK oficial `@modelcontextprotocol/sdk` (v1.32.1), organizar o projeto,
testar com o MCP Inspector e com testes automatizados, e saber registrar seu servidor em clients como Claude
Desktop, Claude Code e VS Code.

## Explicação

### Instalação

```bash
npm install @modelcontextprotocol/sdk@1.32.1 zod@4.6.7
```

O SDK tem `zod` como dependência de pares (aceita `^3.25 || ^4.0`) e precisa de Node com ES modules
(`"type": "module"`). Os imports usam o sufixo `.js` no caminho (`@modelcontextprotocol/sdk/server/mcp.js`).
Existe uma linha v2 do SDK em desenvolvimento (pacotes separados `@modelcontextprotocol/server` e `/client`);
este módulo usa a **v1.x**, que é a `latest` no npm hoje.

### API do servidor (`McpServer`)

| Método | O que registra | Observação |
|---|---|---|
| `registerTool(nome, { title, description, inputSchema, outputSchema, annotations }, handler)` | tool | `inputSchema` é um *shape* zod (`{ a: z.number() }`); o SDK converte para JSON Schema e valida |
| `registerResource(nome, uriOuTemplate, metadados, handler)` | resource fixo ou template | template: `new ResourceTemplate('crm://clientes/{id}', { list })` |
| `registerPrompt(nome, { title, description, argsSchema }, handler)` | prompt | devolve `{ messages: [...] }` |
| `connect(transport)` | liga a um transporte | `StdioServerTransport` ou `StreamableHTTPServerTransport` |

Os métodos antigos `server.tool()`, `server.resource()` e `server.prompt()` ainda existem, mas estão
**depreciados**. Use os `register*`.

O handler da tool recebe `(args, extra)`. Em `extra` vêm `authInfo` (quem está autenticado, no HTTP),
`signal` (cancelamento), `sessionId` e helpers para notificações.

### API do client (`Client`)

```js
const client = new Client({ name: 'meu-app', version: '1.0.0' });
await client.connect(transport);                      // faz o handshake
await client.listTools();                             // { tools: [{ name, description, inputSchema, annotations }] }
await client.callTool({ name: 'somar', arguments: { a: 1, b: 2 } });
await client.listResources(); await client.readResource({ uri: 'info://sobre' });
await client.listPrompts();   await client.getPrompt({ name: 'revisar_codigo', arguments: { codigo: '...' } });
```

Transportes de client: `StdioClientTransport({ command, args, env })` (sobe o servidor como processo filho) e
`StreamableHTTPClientTransport(new URL(...), { requestInit: { headers } })`. Para testes, `InMemoryTransport.createLinkedPair()`
liga client e servidor no mesmo processo.

### Estrutura de projeto recomendada

```
meu-mcp/
├── src/
│   ├── servidor.js        # criarServidor(deps): registra tools/resources/prompts (sem transporte)
│   ├── tools/             # um arquivo por domínio (clientes.js, faturas.js) se crescer
│   ├── stdio.js           # entrada stdio: criarServidor + StdioServerTransport
│   └── http.js            # entrada HTTP: express + auth + rate limit + StreamableHTTPServerTransport
└── test/servidor.test.js  # InMemoryTransport + node:test/vitest
```

A ideia central é **separar a fábrica do servidor do transporte**: o mesmo `criarServidor()` roda em stdio para
a IDE, em HTTP para produção e em memória nos testes. Os exemplos 02 (`crm.js` + `server.js`) e o exercício 01
seguem esse padrão.

### Testando

1. **Testes automatizados** com `InMemoryTransport`: rápidos, passam pelo protocolo de verdade (validação zod,
   JSON-RPC). Veja o [exercício 01](../exercicios/01-mcp-de-suporte/).
2. **MCP Inspector** (v2.11.0): ferramenta oficial com UI web, TUI e **CLI**. A CLI é ótima para CI:

```bash
npx -y @modelcontextprotocol/inspector@2.11.0 --cli node server.js --method tools/list
npx -y @modelcontextprotocol/inspector@2.11.0 --cli node server.js --method tools/call --tool-name somar --tool-arg a=2 --tool-arg b=3
npx -y @modelcontextprotocol/inspector@2.11.0 --cli http://127.0.0.1:30353/mcp --header "Authorization: Bearer ..." --method tools/list
```

   Use `-q --format json` para saída limpa (para `jq`). O código de saída diferencia falhas: no teste local,
   tool com `isError` saiu com 5 e falta de autenticação com 3.

3. **Em diferentes clients de LLM**: o mesmo servidor stdio pode ser registrado no Claude Desktop, Claude Code,
   VS Code e Cursor (formatos abaixo). Para testar com um LLM local sem instalar nada, use a ponte do
   [exemplo 03](../exemplos/03-ponte-mcp-llm/).

### Configurando em clients e IDEs (copilots customizados)

Cada client tem um arquivo JSON. **Não instalamos nada aqui**: os trechos mostram o formato.

**Claude Desktop** (`claude_desktop_config.json`) usa `mcpServers` com servidores locais (stdio):

```json
{
  "mcpServers": {
    "crm-billing": {
      "command": "node",
      "args": ["/caminho/absoluto/modulos/03-mcp/exemplos/02-empresa-como-mcp/server.js"],
      "env": { "DATABASE_URL": "postgres://ia:ia@localhost:5433/ia" }
    }
  }
}
```

**Claude Code** (`.mcp.json` na raiz do projeto) usa o mesmo `mcpServers` e aceita também servidores remotos,
com expansão de variáveis de ambiente (`${VAR}`) para não gravar o token no arquivo:

```json
{
  "mcpServers": {
    "crm-billing": { "command": "node", "args": ["exemplos/02-empresa-como-mcp/server.js"], "env": { "DATABASE_URL": "${DATABASE_URL}" } },
    "catalogo": { "type": "http", "url": "https://mcp.interno.exemplo/mcp", "headers": { "Authorization": "Bearer ${CATALOGO_TOKEN}" } }
  }
}
```

No Claude Code também dá para registrar pela linha de comando: `claude mcp add --transport http catalogo https://...`
(com `--header "Authorization: Bearer ..."`) ou `claude mcp add crm -- node /caminho/server.js`.

**VS Code / GitHub Copilot** (`.vscode/mcp.json`) usa a chave `servers` e permite pedir segredos ao usuário com `inputs`:

```json
{
  "inputs": [{ "type": "promptString", "id": "catalogo-token", "description": "Token do catálogo", "password": true }],
  "servers": {
    "crm-billing": { "type": "stdio", "command": "node", "args": ["${workspaceFolder}/exemplos/02-empresa-como-mcp/server.js"] },
    "catalogo": { "type": "http", "url": "https://mcp.interno.exemplo/mcp", "headers": { "Authorization": "Bearer ${input:catalogo-token}" } }
  }
}
```

Isso é o "copilot customizado": a IDE passa a enxergar as tools do seu sistema interno no chat do agente.

### Compondo MCPs

Um host pode ter vários clients, um por servidor. Se você constrói o próprio agente, faça um **agregador**:
conecta em N servidores, prefixa as tools (`crm__buscar_clientes`, `catalogo__consultar_estoque`) para evitar
colisão de nomes e roteia `tools/call` para o client certo ([exemplo 05](../exemplos/05-testar-e-compor/)).
Também é possível um servidor MCP que é client de outros (proxy/gateway), centralizando auth e auditoria.

## Código mínimo

```js
// Client que sobe um servidor stdio e chama uma tool
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'app', version: '1.0.0' });
await client.connect(new StdioClientTransport({
  command: process.execPath, args: ['server.js'],
  env: { ...getDefaultEnvironment(), DATABASE_URL: process.env.DATABASE_URL },
}));
console.log((await client.callTool({ name: 'somar', arguments: { a: 2, b: 40 } })).content[0].text);
```

## Na prática

- [Exemplo 01 · servidor stdio + client](../exemplos/01-servidor-stdio/)
- [Exemplo 02 · empresa como MCP (Postgres + zod)](../exemplos/02-empresa-como-mcp/)
- [Exemplo 05 · Inspector CLI, composição e UI](../exemplos/05-testar-e-compor/)
- [Exercício 01 · MCP de suporte com testes](../exercicios/01-mcp-de-suporte/)

## Armadilhas

- **`console.log` em servidor stdio** corrompe o JSON-RPC (o stdout é o canal). Use `console.error`.
- **Variáveis de ambiente no stdio**: o `StdioClientTransport` repassa ao filho só variáveis "seguras" (`PATH`,
  `HOME`, `USER`...). `DATABASE_URL` e afins precisam ir explícitas em `env` (o mesmo vale no JSON dos clients).
- **Caminho relativo no JSON do client**: Claude Desktop sobe o processo de outro diretório; use caminho absoluto.
- **`inputSchema` com `$schema`**: o SDK inclui `"$schema": "http://json-schema.org/draft-07/schema#"`; alguns
  provedores de LLM recusam isso dentro de `parameters`. Remova ao converter (exemplo 03).
- **`node --test pasta/`** no Node 24 trata a pasta como arquivo e falha; passe um glob (`'pasta/*.test.js'`).
- **Inspector e OAuth**: contra servidor HTTP que responde 401, a CLI tenta OAuth interativo e falha sem TTY.
  Em CI use `--stored-auth-only` ou mande o header certo. A primeira execução também cria `~/.mcp-inspector/`.
- **Inspector conta como várias requisições** (initialize, GET de stream, list...): com rate limit baixo, a CLI
  toma 429 já na segunda chamada.

## Fontes

- SDK TypeScript (README, docs/server.md, docs/client.md): https://github.com/modelcontextprotocol/typescript-sdk
- Versão no npm: https://registry.npmjs.org/@modelcontextprotocol/sdk/latest
- Construir um servidor: https://modelcontextprotocol.io/docs/develop/build-server
- Construir um client: https://modelcontextprotocol.io/docs/develop/build-client
- MCP Inspector: https://modelcontextprotocol.io/docs/tools/inspector e https://github.com/modelcontextprotocol/inspector (clients/cli/README.md)
- Conectar servidores locais (Claude Desktop): https://modelcontextprotocol.io/docs/develop/connect-local-servers
- Claude Code + MCP: https://code.claude.com/docs/en/mcp
- VS Code + MCP: https://code.visualstudio.com/docs/copilot/customization/mcp-servers
