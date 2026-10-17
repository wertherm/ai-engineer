// Testes com InMemoryTransport: client e servidor no mesmo processo, sem stdio nem HTTP.
// Rápidos e determinísticos, mas passam pelo protocolo MCP de verdade (JSON-RPC, validação zod).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { criarServidorSuporte } from './suporte.js';

let client;
beforeEach(async () => {
  const [ladoClient, ladoServidor] = InMemoryTransport.createLinkedPair();
  await criarServidorSuporte().connect(ladoServidor);
  client = new Client({ name: 'teste', version: '1.0.0' });
  await client.connect(ladoClient);
});
afterEach(() => client.close());

const chamar = (name, args) => client.callTool({ name, arguments: args });

test('expõe as 3 tools com schema e annotations', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['abrir_ticket', 'fechar_ticket', 'listar_tickets']);
  const abrir = tools.find((t) => t.name === 'abrir_ticket');
  assert.deepEqual(abrir.inputSchema.properties.prioridade.enum, ['baixa', 'media', 'alta']);
  assert.equal(tools.find((t) => t.name === 'listar_tickets').annotations.readOnlyHint, true);
});

test('abre ticket com prioridade padrão e lista por status', async () => {
  const r = await chamar('abrir_ticket', { cliente: 'Oficina Turbo', assunto: 'Boleto não chegou' });
  assert.equal(r.isError, undefined);
  assert.equal(r.structuredContent.ticket.prioridade, 'media');
  const { structuredContent } = await chamar('listar_tickets', { status: 'aberto' });
  assert.equal(structuredContent.tickets.length, 1);
});

test('fecha ticket e não deixa fechar de novo', async () => {
  const { structuredContent } = await chamar('abrir_ticket', { cliente: 'Padaria', assunto: 'Erro no login', prioridade: 'alta' });
  const id = structuredContent.ticket.id;
  const fechado = await chamar('fechar_ticket', { id, resolucao: 'Senha resetada' });
  assert.equal(fechado.structuredContent.ticket.status, 'fechado');
  const deNovo = await chamar('fechar_ticket', { id, resolucao: 'Senha resetada' });
  assert.equal(deNovo.isError, true);
  assert.match(deNovo.content[0].text, /já está fechado/);
});

test('ticket inexistente e argumentos inválidos viram isError', async () => {
  assert.equal((await chamar('fechar_ticket', { id: 42, resolucao: 'qualquer' })).isError, true);
  const invalido = await chamar('abrir_ticket', { cliente: 'X', assunto: 'oi', prioridade: 'urgente' });
  assert.equal(invalido.isError, true);
  assert.match(invalido.content[0].text, /Input validation error/);
});

test('resource suporte://tickets/{id} devolve o ticket', async () => {
  await chamar('abrir_ticket', { cliente: 'Clínica Sorriso', assunto: 'Nota fiscal errada' });
  const r = await client.readResource({ uri: 'suporte://tickets/1' });
  assert.equal(JSON.parse(r.contents[0].text).cliente, 'Clínica Sorriso');
});
