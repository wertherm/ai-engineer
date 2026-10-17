// Entrada stdio (para Inspector, Claude Desktop, VS Code...).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { criarServidorSuporte } from './suporte.js';

await criarServidorSuporte().connect(new StdioServerTransport());
console.error('[suporte] pronto (stdio)');
