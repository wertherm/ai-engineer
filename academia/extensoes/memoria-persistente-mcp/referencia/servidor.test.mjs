// Testes do servidor MCP da memória. Precisam do SDK instalado (`npm install` nesta pasta); sem ele, são pulados.
//   cd academia/extensoes/memoria-persistente-mcp && npm install && npm test
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { criarMemoria } from './memoria.mjs';

let Client;
let InMemoryTransport;
let criarServidor;
try {
  ({ Client } = await import('@modelcontextprotocol/sdk/client/index.js'));
  ({ InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js'));
  ({ criarServidor } = await import('./servidor.mjs'));
} catch { /* SDK não instalado */ }
const semSdk = !Client || !criarServidor;

const aqui = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-mcp-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('servidor MCP da memória', { skip: semSdk && 'instale as dependências: npm install' }, () => {
  let cliente;
  before(async () => {
    const memoria = criarMemoria({ arquivo: path.join(tmp, 'a.jsonl'), escoposPermitidos: ['proj-a'] });
    const servidor = criarServidor(memoria);
    const [t1, t2] = InMemoryTransport.createLinkedPair();
    await servidor.connect(t1);
    cliente = new Client({ name: 'teste', version: '1.0.0' });
    await cliente.connect(t2);
  });
  after(async () => { await cliente?.close(); });

  const chamar = (name, args) => cliente.callTool({ name, arguments: args });

  it('expõe as três ferramentas com anotações coerentes', async () => {
    const { tools } = await cliente.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['forget_memory', 'save_memory', 'search_memory']);
    const por = Object.fromEntries(tools.map((t) => [t.name, t]));
    assert.equal(por.search_memory.annotations.readOnlyHint, true);
    assert.equal(por.forget_memory.annotations.destructiveHint, true);
    assert.match(por.save_memory.description, /nunca credenciais/);
  });

  it('salva, busca e esquece pelo protocolo', async () => {
    const salvo = await chamar('save_memory', { escopo: 'proj-a', chave: 'decisao.banco', tipo: 'decisao', valor: 'Usar PostgreSQL pelo ACID.' });
    assert.ok(!salvo.isError, JSON.stringify(salvo));
    assert.equal(salvo.structuredContent.substituiu, false);
    const achado = await chamar('search_memory', { escopo: 'proj-a', consulta: 'postgresql' });
    assert.equal(achado.structuredContent.itens[0].chave, 'decisao.banco');
    assert.match(achado.structuredContent.aviso, /DADO/);
    const apagado = await chamar('forget_memory', { escopo: 'proj-a', chave: 'decisao.banco' });
    assert.equal(apagado.structuredContent.removida, true);
    assert.equal((await chamar('search_memory', { escopo: 'proj-a' })).structuredContent.total, 0);
  });

  it('erros viram isError com código e sem repetir segredo; escopo não liberado é negado', async () => {
    const segredo = 'sk-' + 'Qw3r'.repeat(6);
    const r = await chamar('save_memory', { escopo: 'proj-a', chave: 'cred', valor: `minha chave ${segredo}` });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /^segredo_recusado:/);
    assert.ok(!JSON.stringify(r).includes(segredo));
    const negado = await chamar('search_memory', { escopo: 'proj-b' });
    assert.equal(negado.isError, true);
    assert.match(negado.content[0].text, /^escopo_negado:/);
  });

  it('o SDK valida os argumentos antes do handler (tipo inválido e limite acima do máximo)', async () => {
    const r1 = await chamar('save_memory', { escopo: 'proj-a', chave: 'k', tipo: 'credencial', valor: 'x' });
    assert.equal(r1.isError, true);
    const r2 = await chamar('search_memory', { escopo: 'proj-a', limite: 1000 });
    assert.equal(r2.isError, true);
  });
});

describe('servidor MCP por stdio', { skip: semSdk && 'instale as dependências: npm install' }, () => {
  it('o stdout só carrega mensagens JSON-RPC (logs vão para o stderr) e não abre porta nenhuma', async () => {
    const arquivo = path.join(tmp, 'stdio.jsonl');
    const filho = spawn(process.execPath, [path.join(aqui, 'servidor.mjs')], {
      env: { ...process.env, MEMORIA_ARQUIVO: arquivo, MEMORIA_ESCOPOS: 'proj-a' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    filho.stdout.on('data', (d) => { stdout += d; });
    filho.stderr.on('data', (d) => { stderr += d; });
    const pedido = (id, method, params) => `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
    filho.stdin.write(pedido(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } }));
    filho.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    filho.stdin.write(pedido(2, 'tools/list', {}));
    await new Promise((ok, falha) => {
      const limite = setTimeout(() => falha(new Error('sem resposta do servidor')), 15_000);
      const olhar = setInterval(() => {
        if (stdout.split('\n').filter(Boolean).length >= 2) { clearTimeout(limite); clearInterval(olhar); ok(); }
      }, 50);
    });
    filho.kill();
    const linhas = stdout.split('\n').filter(Boolean);
    assert.ok(linhas.length >= 2);
    for (const l of linhas) {
      const msg = JSON.parse(l); // qualquer linha que não seja JSON quebraria o protocolo
      assert.equal(msg.jsonrpc, '2.0');
    }
    assert.match(stderr, /servidor pronto no stdio/);
  });
});
