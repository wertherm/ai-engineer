// Verifica a solução: escopos por tool e cota por plano.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const PORT = 30361;
const URL_MCP = `http://127.0.0.1:${PORT}/mcp`;
const srv = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], { env: { ...process.env, PORT: String(PORT) } });
const auditoria = [];
srv.stdout.on('data', (d) => auditoria.push(d.toString().trim()));

// JSON-RPC cru em modo stateless (cada POST é independente).
let id = 0;
async function rpc(token, method, params = {}) {
  const r = await fetch(URL_MCP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  return { status: r.status, corpo: await r.json() };
}
const nomes = (r) => r.corpo.result.tools.map((t) => t.name);

try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }

  const leitorTools = await rpc('tok-leitor', 'tools/list');
  const editorTools = await rpc('tok-editor', 'tools/list');
  assert.deepEqual(nomes(leitorTools), ['consultar_preco']);
  assert.deepEqual(nomes(editorTools), ['consultar_preco', 'ajustar_preco']);
  console.log('tools/list leitor:', nomes(leitorTools), '| editor:', nomes(editorTools));

  // Leitor tenta chamar a tool de escrita mesmo sem vê-la -> erro de protocolo (tool não existe para ele).
  const tentativa = await rpc('tok-leitor', 'tools/call', { name: 'ajustar_preco', arguments: { sku: 'CAF-001', novo_preco: 1 } });
  console.log('leitor chama ajustar_preco ->', JSON.stringify(tentativa.corpo.error ?? tentativa.corpo.result));

  const ajuste = await rpc('tok-editor', 'tools/call', { name: 'ajustar_preco', arguments: { sku: 'CAF-001', novo_preco: 45 } });
  console.log('editor ajusta CAF-001 para 45 ->', ajuste.corpo.result.content[0].text);
  const abusivo = await rpc('tok-editor', 'tools/call', { name: 'ajustar_preco', arguments: { sku: 'CAF-001', novo_preco: 4.5 } });
  assert.equal(abusivo.corpo.result.isError, true);
  console.log('editor ajusta para 4.5 ->', abusivo.corpo.result.content[0].text);

  // Plano free: capacidade 3 e já gastou 2 (tools/list + tentativa). Próximas: 1 passa, depois 429.
  const statusFree = [];
  for (let i = 0; i < 3; i++) statusFree.push((await rpc('tok-leitor', 'tools/call', { name: 'consultar_preco', arguments: { sku: 'CAF-001' } })).status);
  assert.deepEqual(statusFree, [200, 429, 429]);
  // Plano pro: capacidade 20, gastou 3 -> 10 chamadas seguidas passam.
  const statusPro = [];
  for (let i = 0; i < 10; i++) statusPro.push((await rpc('tok-editor', 'tools/list')).status);
  assert.ok(statusPro.every((s) => s === 200));
  console.log('free (3 chamadas):', statusFree.join(' '), '| pro (10 chamadas):', [...new Set(statusPro)].join(' '));

  await new Promise((r) => setTimeout(r, 100));
  console.log('auditoria:', auditoria.join(' | '));
  console.log('OK: escopos e cotas funcionando.');
} finally {
  srv.kill('SIGTERM');
}
