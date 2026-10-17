// Compor MCPs: um client "agregador" conecta em vários servidores (stdio e HTTP),
// junta as tools com prefixo por servidor (evita colisão de nomes) e roteia cada chamada.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { criarPool, resetarBanco, DATABASE_URL } from '../02-empresa-como-mcp/db.js';

const caminho = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const SEP = '__';

async function esperarHealth(url) {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout esperando ${url}`);
}

export async function conectarTudo({ portaCatalogo = 30350 } = {}) {
  const pool = criarPool();
  await resetarBanco(pool);
  await pool.end();

  // Servidor 1: CRM/billing local, via stdio (exemplo 02).
  const crm = new Client({ name: 'agregador', version: '1.0.0' });
  await crm.connect(new StdioClientTransport({
    command: process.execPath,
    args: [caminho('../02-empresa-como-mcp/server.js')],
    env: { ...getDefaultEnvironment(), DATABASE_URL },
    stderr: 'ignore',
  }));

  // Servidor 2: catálogo remoto, via Streamable HTTP com service token (exemplo 04).
  // Aqui o subimos como processo filho só para o exemplo ser autocontido.
  const proc = spawn(process.execPath, [caminho('../04-mcp-http-producao/server.js')], {
    env: { ...process.env, PORT: String(portaCatalogo), RATE_LIMIT: '100' },
    stdio: 'ignore',
  });
  await esperarHealth(`http://127.0.0.1:${portaCatalogo}/health`);
  const catalogo = new Client({ name: 'agregador', version: '1.0.0' });
  await catalogo.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${portaCatalogo}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${process.env.CATALOGO_TOKEN ?? 'tok-copilot-demo'}` } },
  }));

  const servidores = { crm, catalogo };
  const tools = [];
  for (const [prefixo, client] of Object.entries(servidores)) {
    for (const t of (await client.listTools()).tools) tools.push({ ...t, name: `${prefixo}${SEP}${t.name}` });
  }

  return {
    tools,
    // Roteia "crm__buscar_clientes" para o client "crm" com o nome original.
    async chamar(nome, args) {
      const [prefixo, ...resto] = nome.split(SEP);
      const client = servidores[prefixo];
      if (!client) return { isError: true, content: [{ type: 'text', text: `Servidor desconhecido: ${prefixo}` }] };
      return client.callTool({ name: resto.join(SEP), arguments: args });
    },
    async fechar() {
      await crm.close();
      await catalogo.close();
      proc.kill('SIGTERM');
    },
  };
}
