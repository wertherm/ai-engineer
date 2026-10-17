// A UI também é um CLIENTE MCP: descobre as tools que o back-end expõe (tools/list) e chama as de
// leitura direto do navegador, com o SDK oficial. A mesma superfície que um agente externo usa.
import { Injectable } from '@angular/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface ToolInfo { name: string; description?: string }

@Injectable({ providedIn: 'root' })
export class McpService {
  private client: Client | null = null;

  async conectar(chave: string): Promise<ToolInfo[]> {
    await this.client?.close();
    this.client = new Client({ name: 'politicas-web', version: '1.0.0' });
    const url = new URL('/mcp', window.location.origin);
    await this.client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${chave}` } } }));
    const { tools } = await this.client.listTools();
    return tools.map(({ name, description }) => ({ name, description }));
  }

  /** Chama uma tool e devolve o structuredContent (ou o texto, se a tool não tiver saída estruturada). */
  async chamar<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.client) throw new Error('MCP não conectado');
    const r = await this.client.callTool({ name, arguments: args });
    if (r.isError) throw new Error(JSON.stringify(r.content));
    const sc = r.structuredContent as { itens?: T } | undefined;
    return (sc?.itens ?? r.content) as T;
  }
}
