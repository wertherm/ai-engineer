// Teste ponta a ponta do MCP HTTP: sobe o servidor, exercita cenários válidos e de abuso,
// mostra o log de auditoria e derruba o servidor pelo PID.
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = 30341;
const URL_MCP = `http://127.0.0.1:${PORT}/mcp`;
const logs = [];
const srv = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], {
  env: { ...process.env, PORT: String(PORT), RATE_LIMIT: '8', RATE_WINDOW_MS: '60000' },
});
srv.stdout.on('data', (d) => logs.push(...d.toString().trim().split('\n')));

try {
  // Espera o /health responder.
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch {}
    if (i > 50) throw new Error('servidor não subiu');
    await new Promise((r) => setTimeout(r, 100));
  }

  // 1) Client oficial com service token válido.
  const client = new Client({ name: 'copilot', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_MCP), {
    requestInit: { headers: { Authorization: 'Bearer tok-copilot-demo' } },
  }));
  const { tools } = await client.listTools();
  console.log('1) token válido -> tools:', tools.map((t) => t.name).join(', '));
  const quem = await client.callTool({ name: 'quem_sou_eu', arguments: {} });
  console.log('   quem_sou_eu ->', quem.content[0].text);
  const est = await client.callTool({ name: 'consultar_estoque', arguments: { sku: 'MOE-010' } });
  console.log('   consultar_estoque(MOE-010) ->', est.content[0].text);
  await client.close();

  // Requisição JSON-RPC crua (o que um atacante ou um client mal configurado faria).
  const rpc = (headers, body = { jsonrpc: '2.0', id: 1, method: 'tools/list' }) =>
    fetch(URL_MCP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(body),
    });

  // 2) Sem token -> 401 + WWW-Authenticate (cabeçalho padrão do Bearer/OAuth).
  const semToken = await rpc({});
  assert.equal(semToken.status, 401);
  console.log('2) sem token ->', semToken.status, '|', semToken.headers.get('www-authenticate'));

  // 3) Token inválido -> 401.
  const invalido = await rpc({ Authorization: 'Bearer chutei-um-token' });
  assert.equal(invalido.status, 401);
  console.log('3) token inválido ->', invalido.status, '|', (await invalido.json()).error_description);

  // 4) Token sem o escopo exigido -> 403.
  const semEscopo = await rpc({ Authorization: 'Bearer tok-sem-escopo' });
  assert.equal(semEscopo.status, 403);
  console.log('4) token sem escopo ->', semEscopo.status, '|', (await semEscopo.json()).error_description);

  // 5) Rajada acima do limite (8/min por cliente) -> 429 com Retry-After.
  const status = [];
  let retryAfter;
  for (let i = 0; i < 10; i++) {
    const r = await rpc({ Authorization: 'Bearer tok-ide-demo' });
    status.push(r.status);
    if (r.status === 429) retryAfter = r.headers.get('retry-after');
  }
  assert.deepEqual(status.filter((s) => s === 429).length, 2);
  console.log('5) rajada de 10 ->', status.join(' '), `| Retry-After: ${retryAfter}s`);

  // 6) Host forjado (DNS rebinding) -> 403 antes mesmo da autenticação. fetch não deixa trocar o Host, por isso http.request.
  const hostForjado = await new Promise((resolve) => {
    http.request({ host: '127.0.0.1', port: PORT, path: '/mcp', method: 'POST', headers: { Host: 'evil.example', Authorization: 'Bearer tok-copilot-demo' } },
      (res) => resolve(res.statusCode)).end('{}');
  });
  assert.equal(hostForjado, 403);
  console.log('6) Host forjado ->', hostForjado);

  // A auditoria registrou tudo que passou por /mcp (o 403 do Host é barrado antes do middleware).
  await new Promise((r) => setTimeout(r, 100));
  console.log(`\nAuditoria (${logs.length} linhas, mostrando 4):`);
  const chamadaDeTool = logs.find((l) => l.includes('"tool":"consultar_estoque"'));
  for (const l of [logs[0], chamadaDeTool, logs.find((l) => l.includes('"status":401')), logs[logs.length - 1]]) console.log(' ', l);
  console.log('\nTodos os cenários passaram.');
} finally {
  srv.kill('SIGTERM'); // para pelo PID do processo filho
}
