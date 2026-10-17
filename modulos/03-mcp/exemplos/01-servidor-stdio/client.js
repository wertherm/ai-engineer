// Client MCP: sobe o servidor como processo filho (stdio), faz o handshake e usa tudo que ele expõe.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('./server.js', import.meta.url));
const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], stderr: 'ignore' });
const client = new Client({ name: 'cliente-exemplo', version: '1.0.0' });

await client.connect(transport); // initialize + notifications/initialized
console.log('Servidor:', client.getServerVersion());
console.log('Capabilities:', Object.keys(client.getServerCapabilities()).join(', '));

const { tools } = await client.listTools();
console.log('\nTools:');
for (const t of tools) console.log(`- ${t.name}: ${t.description} | schema: ${JSON.stringify(t.inputSchema.properties)}`);

const soma = await client.callTool({ name: 'somar', arguments: { a: 2, b: 40 } });
console.log('\nsomar(2, 40) ->', soma.content[0].text, '| structuredContent:', JSON.stringify(soma.structuredContent));

const dia = await client.callTool({ name: 'dia_da_semana', arguments: { data: '2026-10-16' } });
console.log('dia_da_semana ->', dia.content[0].text);

// Argumento inválido: o SDK valida com zod e devolve isError: true (não lança exceção).
const invalido = await client.callTool({ name: 'somar', arguments: { a: 'dois', b: 1 } });
console.log('somar("dois", 1) -> isError:', invalido.isError, '|', invalido.content[0].text.slice(0, 80));

const { resources } = await client.listResources();
const { resourceTemplates } = await client.listResourceTemplates();
console.log('\nResources:', resources.map((r) => r.uri).join(', '), '| templates:', resourceTemplates.map((r) => r.uriTemplate).join(', '));
console.log('info://sobre ->', (await client.readResource({ uri: 'info://sobre' })).contents[0].text);
console.log('saudacao://Werther ->', (await client.readResource({ uri: 'saudacao://Werther' })).contents[0].text);

const { prompts } = await client.listPrompts();
console.log('\nPrompts:', prompts.map((p) => `${p.name}(${p.arguments.map((a) => a.name)})`).join(', '));
const prompt = await client.getPrompt({ name: 'revisar_codigo', arguments: { codigo: 'let x = 1' } });
console.log('revisar_codigo ->', JSON.stringify(prompt.messages[0].content.text));

await client.close();
