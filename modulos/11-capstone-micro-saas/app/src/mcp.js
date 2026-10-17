// Ponte IA-UI: o MESMO serviço exposto como servidor MCP, para que agentes (Claude, IDEs, ADK, o nosso
// agente da entrega 3) e a própria UI usem as capacidades do Micro-SaaS por um protocolo padrão.
// Padrões do módulo 03: McpServer + registerTool com zod, servidor stateless (um por requisição),
// identidade do cliente vinda da autenticação (aqui, o tenant da API key).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function criarServidorMcp(servico, tenant) {
  const server = new McpServer(
    { name: 'politicas-com-fonte', version: '1.0.0' },
    {
      instructions:
        `Políticas internas da empresa ${tenant.nome}. Use buscar_politicas para trechos (rápido, sem LLM) ` +
        'e perguntar para uma resposta pronta com citações (lento: usa o LLM).',
    },
  );

  const json = (dados) => ({ content: [{ type: 'text', text: JSON.stringify(dados) }], structuredContent: { itens: dados } });

  server.registerTool(
    'listar_documentos',
    {
      title: 'Listar documentos',
      description: 'Lista os documentos de política indexados da empresa (arquivo, título, nº de trechos).',
      annotations: { readOnlyHint: true },
    },
    async () => json(await servico.listarDocumentos(tenant)),
  );

  server.registerTool(
    'buscar_politicas',
    {
      title: 'Buscar nas políticas',
      description: 'Busca híbrida (semântica + palavra-chave) nas políticas da empresa. Devolve trechos com o arquivo de origem.',
      inputSchema: {
        consulta: z.string().min(3).max(300).describe('assunto ou pergunta'),
        k: z.number().int().min(1).max(8).default(3).describe('quantos trechos'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ consulta, k }) => {
      const trechos = await servico.buscar(tenant, consulta, { k, canal: 'mcp' });
      return json(trechos.map((t) => ({ fonte: t.fonte, trecho: t.conteudo, similaridade: Number(t.sim.toFixed(3)) })));
    },
  );

  server.registerTool(
    'perguntar',
    {
      title: 'Perguntar às políticas',
      description: 'Responde uma pergunta sobre as políticas da empresa com citações verificadas [n]. Usa o LLM (pode levar minutos em CPU).',
      inputSchema: { pergunta: z.string().min(3).max(500) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ pergunta }) => {
      const r = await servico.perguntar(tenant, pergunta, { canal: 'mcp' });
      return {
        content: [{ type: 'text', text: JSON.stringify({ resposta: r.resposta, citacoes: r.citacoes.map((c) => c.fonte), verificado: r.verificado }) }],
      };
    },
  );

  return server;
}
