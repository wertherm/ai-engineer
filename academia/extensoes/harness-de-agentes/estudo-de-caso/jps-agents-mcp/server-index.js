// SNAPSHOT DE ESTUDO. Não use em produção e não rode: ele existe para ser lido, analisado por engenharia reversa e endurecido.
// Origem: mcp-server/index.js do repositório privado de squad de agentes do mantenedor. Sem alterações no código abaixo.
// Roteiro de análise: ../../README.md#3-estudo-de-caso-o-servidor-de-ferramentas-do-jps-agents e ../../../engenharia-reversa/README.md.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getToolDefinitions, executeTool } from './tools/index.js';

// Initialize MCP Server with proper capabilities
const server = new Server(
  {
    name: 'jps-agents-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// ============================================================================
// TOOL HANDLERS
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.log(`[MCP] Tool called: ${name}`);

  // Execute dynamic tools (browser_search, http_get)
  const result = await executeTool(name, args);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
});

// ============================================================================
// TOOLS LISTING
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Get dynamic tools from registry (browser_search, http_get)
  const tools = getToolDefinitions();

  console.log(`[MCP] Listing ${tools.length} tools`);

  return {
    tools: tools
  };
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('[MCP] Server started successfully');
}

main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
