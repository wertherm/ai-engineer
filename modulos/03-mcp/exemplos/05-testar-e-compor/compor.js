// Demo de composição: um único catálogo de tools vindo de 2 servidores MCP diferentes.
import { conectarTudo } from './composicao.js';

const mcp = await conectarTudo();
try {
  console.log(`Tools agregadas (${mcp.tools.length}):`);
  for (const t of mcp.tools) console.log(' -', t.name);

  // Fluxo que cruza os dois sistemas: cliente do CRM + produto do catálogo.
  const cli = await mcp.chamar('crm__buscar_clientes', { termo: 'oficina' });
  const cliente = cli.structuredContent.clientes[0];
  const est = JSON.parse((await mcp.chamar('catalogo__consultar_estoque', { sku: 'MOE-010' })).content[0].text);
  console.log(`\n${cliente.nome} (plano ${cliente.plano}) quer 1 moedor: preço R$ ${est.preco}, estoque ${est.estoque} -> ${est.estoque > 0 ? 'pode vender' : 'sem estoque'}`);

  const r = await mcp.chamar('erp__emitir_nf', {});
  console.log('Servidor inexistente ->', r.content[0].text);
} finally {
  await mcp.fechar();
}
