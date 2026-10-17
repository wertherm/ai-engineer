import { executarAgente } from './agente.js';
import { resumoUso } from '../../comum/llm.js';

const tarefa = process.argv[2] ??
  'Temos teclados suficientes para 3 pedidos de 12 unidades cada? Quantos sobram?';
console.log('Tarefa:', tarefa);
const t0 = Date.now();
const r = await executarAgente(tarefa);
console.log(`\nResumo: ${r.passos} passos em ${((Date.now() - t0) / 1000).toFixed(1)}s · ${resumoUso()}`);
