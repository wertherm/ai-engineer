// Sobe o gateway como processo filho, dispara cenários e derruba pelo PID (nunca pkill).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('./gateway.config.json', import.meta.url)));
const base = `http://localhost:${cfg.porta}`;
const gw = spawn(process.execPath, [new URL('./gateway.js', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
const logs = [];
gw.stdout.on('data', (d) => logs.push(...d.toString().trim().split('\n')));
await new Promise((ok) => gw.stderr.once('data', ok)); // espera o "ouvindo em"

const chamar = (tenant, corpo, traceparent) =>
  fetch(`${base}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant': tenant, ...(traceparent ? { traceparent } : {}) },
    body: JSON.stringify(corpo),
  }).then(async (r) => ({ status: r.status, trace: r.headers.get('x-trace-id'), corpo: await r.json() }));

try {
  const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
  console.log('1) loja-a, tier barato, com traceparent do chamador:');
  const r1 = await chamar('loja-a', { mensagem: 'Defina CDI em 5 palavras.' }, tp);
  console.log(`   ${r1.status} trace=${r1.trace} → ${JSON.stringify(r1.corpo)}`);

  console.log('2) free pedindo tier caro (política):');
  const r2 = await chamar('free', { mensagem: 'oi', tier: 'caro' });
  console.log(`   ${r2.status} → ${JSON.stringify(r2.corpo)}`);

  console.log('3) free, rajada de 3 pedidos simultâneos (balde com 1 ficha):');
  const rajada = await Promise.all([1, 2, 3].map((i) => chamar('free', { mensagem: `Diga apenas o número ${i}.` })));
  rajada.forEach((r) => console.log(`   ${r.status} → ${JSON.stringify(r.corpo)}`));

  console.log('4) tenant desconhecido:');
  console.log(`   ${(await chamar('hacker', { mensagem: 'oi' })).status}`);

  console.log('\nLogs estruturados do gateway (stdout):');
  logs.forEach((l) => console.log(`   ${l}`));
  console.log('\nGET /metrics:');
  console.log((await (await fetch(`${base}/metrics`)).text()).trim().replace(/^/gm, '   '));
} finally {
  gw.kill(); // pelo PID do filho
}
