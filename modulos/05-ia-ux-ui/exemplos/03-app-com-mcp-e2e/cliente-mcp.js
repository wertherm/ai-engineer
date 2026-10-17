// Helpers de cliente MCP (HTTP + Bearer) e da "mini-host" que renderiza o recurso de UI.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCP_TOKEN } from './app.js';

export async function conectarMcp(baseUrl) {
  const client = new Client({ name: 'agente-e2e', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl), {
    requestInit: { headers: { Authorization: `Bearer ${MCP_TOKEN}` } },
  }));
  return client;
}

// Chama uma tool e devolve o JSON do primeiro bloco de texto (todas as tools da app respondem JSON).
export async function chamar(client, name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const texto = r.content?.[0]?.text ?? '';
  if (r.isError) throw new Error(`${name}: ${texto}`);
  return JSON.parse(texto);
}

// Mini-host MCP Apps: a página do "host" põe o HTML do recurso num iframe sandbox (sem
// allow-same-origin) e repassa ao servidor MCP os `tools/call` que o iframe pedir. É uma versão
// mínima do que AppBridge (@modelcontextprotocol/ext-apps) e AppRenderer (@mcp-ui/client) fazem,
// sem o handshake ui/initialize: suficiente para testar o recurso de ponta a ponta.
export async function renderizarRecursoUi(page, client, uri) {
  const { contents } = await client.readResource({ uri });
  const recurso = contents[0];
  const chamadas = [];
  await page.exposeFunction('repassarAoMcp', async (msg) => {
    chamadas.push(msg.params.name);
    const r = await client.callTool({ name: msg.params.name, arguments: msg.params.arguments });
    return r.content?.[0]?.text;
  });
  await page.setContent('<!doctype html><html lang="pt-BR"><head><title>Host</title></head><body><iframe id="app" title="Painel MCP" sandbox="allow-scripts" style="width:100%;height:300px"></iframe></body></html>');
  await page.evaluate((html) => {
    window.addEventListener('message', (e) => { if (e.data?.method === 'tools/call') window.repassarAoMcp(e.data); });
    document.getElementById('app').srcdoc = html;
  }, recurso.text);
  return { recurso, chamadas, frame: page.frameLocator('#app') };
}
