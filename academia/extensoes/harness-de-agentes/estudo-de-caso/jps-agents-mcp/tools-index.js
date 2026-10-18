// SNAPSHOT DE ESTUDO. Não use em produção e não rode: ele existe para ser lido, analisado por engenharia reversa e endurecido.
// Origem: mcp-server/tools/index.js do repositório privado de squad de agentes do mantenedor. Sem alterações no código abaixo.
// Roteiro de análise: ../../README.md#3-estudo-de-caso-o-servidor-de-ferramentas-do-jps-agents e ../../../engenharia-reversa/README.md.

import { browserSearch } from './browser/search.js';
import { httpGet } from './http/get.js';

// Central registry of all available tools
export const tools = [
  browserSearch,
  httpGet
];

// Helper function to find tool by name
export const getTool = (name) => {
  return tools.find(tool => tool.name === name);
};

// Helper function to get all tool definitions for MCP
export const getToolDefinitions = () => {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
};

// Helper function to execute a tool
export const executeTool = async (toolName, args) => {
  const tool = getTool(toolName);
  
  if (!tool) {
    return {
      success: false,
      error: `Tool '${toolName}' not found`
    };
  }
  
  try {
    const result = await tool.execute(args);
    return result;
  } catch (error) {
    console.error(`[tools] Error executing ${toolName}: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
};
