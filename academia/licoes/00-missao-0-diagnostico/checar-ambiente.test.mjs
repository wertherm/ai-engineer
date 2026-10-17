// Testa checar-ambiente.mjs contra um servidor falso (compatível com a API de chat) e contra uma porta fechada.
// Foco: o programa nunca pode imprimir credenciais, porque a saída é feita para ser colada em um arquivo versionado.
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
let modo = 'saudavel';

before(async () => {
  servidor = createServer((req, res) => {
    if (modo === 'erro-http') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Incorrect API key provided: sk-proj-ABCD********wxyz. You can find your key at https://exemplo' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.includes('/models')) res.end(JSON.stringify({ data: [{ id: 'modelo-teste' }] }));
    else if (modo === 'sem-usage') res.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
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
    modo = 'saudavel';
    const r = await rodar({ OPENAI_BASE_URL: `http://127.0.0.1:${porta}/v1`, OPENAI_API_KEY: 'segredo-que-nao-pode-aparecer', MODELO_CHAT: 'modelo-teste' });
    assert.equal(r.codigo, 0, r.saida);
    assert.match(r.saida, /Ambiente pronto/);
    assert.match(r.saida, /prompt_tokens=12/);
    assert.match(r.saida, /\[ok\]\s+CA1/);
    assert.ok(!r.saida.includes('segredo-que-nao-pode-aparecer'));
  });

  it('reprova quando o endpoint não responde', async () => {
    const r = await rodar({ OPENAI_BASE_URL: `http://127.0.0.1:${portaFechada}/v1`, TIMEOUT_MS: '5000' });
    assert.equal(r.codigo, 1, r.saida);
    assert.match(r.saida, /\[falhou\] CA2/);
  });

  it('reprova quando a resposta não traz usage', async () => {
    modo = 'sem-usage';
    const r = await rodar({ OPENAI_BASE_URL: `http://127.0.0.1:${porta}/v1` });
    assert.equal(r.codigo, 1, r.saida);
    assert.match(r.saida, /usage/);
  });

  it('reprova com HTTP de erro e mascara a chave que o provedor repetiu no corpo', async () => {
    modo = 'erro-http';
    const r = await rodar({ OPENAI_BASE_URL: `http://127.0.0.1:${porta}/v1`, OPENAI_API_KEY: 'sk-proj-ABCDEFGH1234wxyz' });
    assert.equal(r.codigo, 1, r.saida);
    assert.match(r.saida, /HTTP 401/);
    assert.ok(!r.saida.includes('ABCD'), r.saida);
    assert.ok(!r.saida.includes('wxyz'), r.saida);
  });

  it('URL com usuário e senha: reprova, não consulta a rede e não imprime nada da credencial', async () => {
    modo = 'saudavel';
    const credencial = ['usuario', 'senha-secreta'];
    const r = await rodar({ OPENAI_BASE_URL: `http://${credencial[0]}:${credencial[1]}@127.0.0.1:${porta}/v1` });
    assert.equal(r.codigo, 1, r.saida);
    assert.match(r.saida, /\[falhou\] URL/);
    assert.ok(!r.saida.includes(credencial[1]), r.saida);
    assert.ok(!r.saida.includes(credencial[0] + ':'), r.saida);
  });

  it('senha com @, URL inválida com segredo, chave colada no lugar da URL e ?token= não vazam', async () => {
    const casos = [
      [`http://u:ab@cd1234@127.0.0.1:${porta}/v1`, ['ab@cd1234', 'cd1234']],
      ['http://u:SENHAINVALIDA99 sem url', ['SENHAINVALIDA99']],
      ['sk-proj-' + 'ZYXW9876'.repeat(4), ['ZYXW9876']],
      [`http://127.0.0.1:${porta}/v1?token=SEGREDOTOKEN123`, ['SEGREDOTOKEN123']],
    ];
    for (const [url, proibidos] of casos) {
      const r = await rodar({ OPENAI_BASE_URL: url });
      assert.equal(r.codigo, 1, `${url} -> ${r.saida}`);
      for (const p of proibidos) assert.ok(!r.saida.includes(p), `"${p}" vazou:\n${r.saida}`);
    }
  });

  it('avisa quando o endpoint é remoto e a chave ficou no padrão', async () => {
    const r = await rodar({ OPENAI_BASE_URL: 'https://api.exemplo.invalid/v1', TIMEOUT_MS: '3000' });
    assert.equal(r.codigo, 1);
    assert.match(r.saida, /\[aviso\]\s+CHAVE/);
  });

  it('TIMEOUT_MS inválido não quebra: usa o padrão', async () => {
    modo = 'saudavel';
    const r = await rodar({ OPENAI_BASE_URL: `http://127.0.0.1:${porta}/v1`, TIMEOUT_MS: 'abc' });
    assert.equal(r.codigo, 0, r.saida);
  });
});
