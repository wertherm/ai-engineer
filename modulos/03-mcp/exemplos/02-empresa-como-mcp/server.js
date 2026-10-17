// Entrada stdio do servidor CRM/billing (é o que um client como Claude Desktop/VS Code executaria).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { criarPool } from './db.js';
import { criarServidorCrm } from './crm.js';

const pool = criarPool();
const server = criarServidorCrm(pool);
await server.connect(new StdioServerTransport());
console.error('[crm-billing] pronto (stdio)');

// Fecha o pool quando o client encerra o processo/stdin.
const encerrar = async () => { await pool.end(); process.exit(0); };
process.stdin.on('close', encerrar);
process.on('SIGTERM', encerrar);
