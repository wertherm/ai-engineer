// Sobe a aplicação para uso manual: http://127.0.0.1:30510 (UI) e /mcp (MCP, Bearer tok-e2e-demo).
import { criarApp } from './app.js';
import { criarEstado } from './estado.js';

const PORT = Number(process.env.PORT ?? 30510);
criarApp(criarEstado()).listen(PORT, '127.0.0.1', () => console.log(`App de tarefas em http://127.0.0.1:${PORT} (MCP em /mcp)`));
