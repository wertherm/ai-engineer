// Mini sistema cooperativo: analista -> planejador -> executor, coordenado por um supervisor,
// com troca de mensagens assíncrona. Os quatro agentes rodam concorrentemente.
import { Barramento } from './barramento.js';
import { analista, planejador, executor, supervisor } from './agentes.js';
import { resumoUso } from '../../comum/llm.js';

const pedido = process.argv[2] ?? 'Organize um café da manhã para 12 pessoas na sexta, com orçamento de R$ 150.';
console.log(`Pedido: ${pedido}\n\nMensagens:`);
const bus = new Barramento();
const [final] = await Promise.all([supervisor(bus, pedido), analista(bus), planejador(bus), executor(bus)]);
console.log('\nResultado:', JSON.stringify(final, null, 2));
console.log(`\n${bus.historico.length} mensagens trocadas · ${resumoUso()}`);
