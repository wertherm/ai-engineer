// Servidor MCP da aplicação: expõe o estado e ações da UI como tools, para agentes e testes E2E,
// e um recurso de UI interativo (MCP Apps, criado com @mcp-ui/server).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createUIResource, RESOURCE_MIME_TYPE } from '@mcp-ui/server';
import { z } from 'zod';
import { htmlPainel } from './painel.js';

export const URI_PAINEL = 'ui://tarefas/painel';
const json = (dados) => ({ content: [{ type: 'text', text: JSON.stringify(dados) }] });

// `extras(server, estado)` permite que outros módulos (ex.: o exercício 02) registrem tools novas
// sem copiar este arquivo.
export function criarServidorMcp(estado, { extras } = {}) {
  const server = new McpServer({ name: 'app-tarefas', version: '1.0.0' });

  server.registerTool('listar_tarefas', {
    description: 'Lista as tarefas atuais da aplicação (id, titulo, concluida)',
    annotations: { readOnlyHint: true },
  }, async () => json(estado.listar()));

  server.registerTool('adicionar_tarefa', {
    description: 'Adiciona uma tarefa pelo back-end (atalho para preparar cenários de teste)',
    inputSchema: { titulo: z.string().min(1).max(80) },
  }, async ({ titulo }) => json(estado.adicionar(titulo)));

  server.registerTool('concluir_tarefa', {
    description: 'Marca a tarefa de id informado como concluída',
    inputSchema: { id: z.number().int().positive() },
  }, async ({ id }) => {
    const t = estado.concluir(id);
    return t ? json(t) : { isError: true, content: [{ type: 'text', text: `Tarefa ${id} não existe` }] };
  });

  server.registerTool('resetar_estado', {
    description: 'Apaga todas as tarefas (fixture de teste: deixa a app num estado conhecido)',
    annotations: { destructiveHint: true, idempotentHint: true },
  }, async () => { estado.resetar(); return json({ ok: true }); });

  // MCP Apps: o recurso ui:// tem mimeType text/html;profile=mcp-app e a tool aponta para ele em
  // _meta.ui.resourceUri. Um host compatível (Claude, VS Code, Goose, MCPJam...) busca o recurso
  // com resources/read e o renderiza num iframe sandbox. Hosts sem suporte só veem o texto.
  server.registerResource('painel_tarefas', URI_PAINEL, { mimeType: RESOURCE_MIME_TYPE, description: 'Painel interativo das tarefas' },
    async () => ({ contents: [createUIResource({ uri: URI_PAINEL, content: { type: 'rawHtml', htmlString: htmlPainel(estado.listar()) }, encoding: 'text' }).resource] }));

  server.registerTool('mostrar_painel', {
    description: 'Mostra o painel interativo de tarefas',
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: URI_PAINEL } },
  }, async () => json({ total: estado.listar().length }));

  extras?.(server, estado);
  return server;
}
