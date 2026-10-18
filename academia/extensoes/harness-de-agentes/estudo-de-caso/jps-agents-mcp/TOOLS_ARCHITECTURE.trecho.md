<!-- SNAPSHOT DE ESTUDO (trecho): documentação do servidor de ferramentas de um repositório privado do mantenedor. Só as seções que a engenharia reversa confronta com o código;
     as seções com exemplos de projetos privados foram omitidas. Os números de linha abaixo NÃO são os do arquivo original. Origem: mcp-server/TOOLS_ARCHITECTURE.md. -->

# (trecho) MCP Tools Architecture

## Padrão de Tool

Cada tool segue este padrão:

```javascript
export const toolName = {
  name: 'tool_name',
  description: 'O que a tool faz',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '...' }
    },
    required: ['param1']
  },
  execute: async (args) => {
    // Implementação
    return { success: true, data: '...' };
  }
};
```


## Fluxo de Execução

```
1. Cliente MCP envia CallToolRequest
   ↓
2. MCP identifica tool pelo name
   ↓
3. Valida inputSchema
   ↓
4. Executa tool.execute(args)
   ↓
5. Retorna resultado como TextContent
```

## Tratamento de Erros

Todas as tools implementam try/catch:

```javascript
try {
  // Operação
} catch (error) {
  return {
    success: false,
    error: error.message
  };
}
```


## Próximas Tools (Roadmap)

- `file_read`: Ler arquivos locais
- `file_write`: Escrever arquivos locais
- `shell_exec`: Executar comandos shell
- `database_query`: Consultar banco de dados
- `email_send`: Enviar emails
- `slack_message`: Enviar mensagens Slack

## Segurança

⚠️ **Importante:**
- Validar inputs em todas as tools
- Usar timeouts para operações longas
- Não expor informações sensíveis em logs
- Implementar rate limiting se necessário
- Sanitizar outputs antes de retornar

