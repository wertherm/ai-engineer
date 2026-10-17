// Testa checar-ambiente.mjs contra um servidor falso (compatível com a API de chat) e contra uma porta fechada.
//   node --test academia/licoes/00-missao-0-diagnostico/checar-ambiente.test.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'checar-ambiente.mjs');

function rodar(env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [script], { env: { ...process.env, ...env } }, (erro, stdout, stderr) => {
      resolve({ codigo: erro ? erro.code : 0, saida: stdout + stderr });
    });
  });
}

let servidor;
let porta;
let portaFechada;
let semUsage = false;

before(async () => {
  servidor = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.endsWith('/models')) res.end(JSON.stringify({ data: [{ id: 'modelo-teste' }] }));
    else if (semUsage) res.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
    else res.end(JSON.stringify({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 },
    }));
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  porta = servidor.address().port;
  // porta livre e depois fechada: conexão recusada
  const temp = net.createServer();
  await new Promise((ok) => temp.listen(0, '127.0.0.1', ok));
  portaFechada = temp.address().port;
  await new Promise((ok) => temp.close(ok));
});

after(() => servidor.close());

describe('checar-ambiente', () => {
  it('passa com um endpoint saudável e não imprime a chave', async () => {
    const r = await rodar({ OPENAI_BASE_URL: `http://127.0.0.1:${porta}/v1`, OPENAI_API_KEY: 'segredo-que-nao-pode-aparecer', MODELO_CHAT: 'modelo-teste' });
    assert.equal(r.codigo, 0, r.saida);
    assert.match(r.saida, /Ambiente pronto/);
    assert.match(r.saida, /prompt_tokens=12/);
    assert.ok(!r.saida.includes('segredo-que-nao-pode-aparecer'));
  });

  it('reprova quando o endpoint não responde', async () => {
    const r = await rodar({ OPENAI_BASE_URL: `http://127.0.0.1:${portaFechada}/v1`, TIMEOUT_MS: '5000' });
    assert.equal(r.codigo, 1, r.saida);
    assert.match(r.saida, /\[falhou\] CA2/);
  });

  it('reprova quando a resposta não traz usage', async () => {
    semUsage = true;
    try {
      const r = await rodar({ OPENAI_BASE_URL: `http://127.0.0.1:${porta}/v1` });
      assert.equal(r.codigo, 1, r.saida);
      assert.match(r.saida, /usage/);
    } finally {
      semUsage = false;
    }
  });

  it('não imprime credenciais embutidas na URL', async () => {
    const r = await rodar({ OPENAI_BASE_URL: `http://usuario:senha-secreta@127.0.0.1:${porta}/v1` });
    assert.ok(!r.saida.includes('senha-secreta'), r.saida);
  });
});
