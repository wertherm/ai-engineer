// Demonstra o CRM exposto via MCP: sobe o servidor por stdio e faz o fluxo de um atendente.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { criarPool, resetarBanco, DATABASE_URL } from './db.js';

// Dados de demonstração sempre iguais a cada execução.
const pool = criarPool();
await resetarBanco(pool);
await pool.end();

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./server.js', import.meta.url))],
  // O SDK só repassa ao filho variáveis "seguras" (PATH, HOME...). DATABASE_URL precisa ir explícita.
  env: { ...getDefaultEnvironment(), DATABASE_URL },
  stderr: 'ignore',
});
const client = new Client({ name: 'atendente', version: '1.0.0' });
await client.connect(transport);
console.log('Instruções do servidor:', client.getInstructions());

const { tools } = await client.listTools();
for (const t of tools) console.log(`- ${t.name} ${JSON.stringify(t.annotations)}`);

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  console.log(`\n${name}(${JSON.stringify(args)})${r.isError ? ' [ERRO]' : ''}\n  ${r.content[0].text}`);
  return r.structuredContent;
};

const { clientes } = await call('buscar_clientes', { termo: 'padaria' });
await call('listar_faturas', { cliente_id: clientes[0].id, status: 'aberta' });
await call('registrar_pagamento', { fatura_id: 2 });
await call('listar_faturas', { cliente_id: clientes[0].id, status: 'aberta' });
await call('registrar_pagamento', { fatura_id: 999 });
await call('listar_faturas', { cliente_id: -1 }); // falha na validação zod

const { resources } = await client.listResources();
console.log('\nResources:', resources.map((r) => `${r.uri} (${r.name})`).join(', '));
console.log('crm://clientes/2 ->', (await client.readResource({ uri: 'crm://clientes/2' })).contents[0].text);

await client.close();
