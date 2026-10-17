import assert from 'node:assert/strict';
import { criarGrafo } from './grafo.js';
import { resumoUso } from '../../../comum/llm.js';

const casos = [
  ['API ok', 'Quero 2 cadeiras entregues no CEP 01310-100', {}],
  ['API fora do ar', 'Quero 2 cadeiras entregues no CEP 01310-100', { apiFalhando: true }],
  ['pedido sem CEP', 'Quero 5 mesas', {}],
];
const saidas = [];
for (const [nome, pedido, opts] of casos) {
  const s = await criarGrafo(opts).invoke({ pedido });
  console.log(`[${nome}] ${s.trilha.join(' -> ')}\n  ${s.resposta}`);
  saidas.push(s);
}
assert.match(saidas[0].resposta, /frete R\$ 25 \(api\)/);
assert.match(saidas[1].resposta, /fallback/);
assert.ok(saidas[2].trilha.includes('fallback'));
console.log(`\n✅ 3 caminhos do grafo verificados · ${resumoUso()}`);
