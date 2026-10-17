// Roda 3 cenários no grafo e grava a trilha de auditoria no Postgres (m04.auditoria).
import { Command } from '@langchain/langgraph';
import { criarPool, resumoUso } from '../../comum/llm.js';
import { criarGrafo, LIMITES } from './grafo.js';

const grafo = criarGrafo();
const pool = await criarPool();
await pool.query(`CREATE TABLE IF NOT EXISTS m04.auditoria (id serial PRIMARY KEY, thread_id text,
  no text, decisao text, detalhe jsonb, ts timestamptz)`);
await pool.query('TRUNCATE m04.auditoria');

// recursionLimit é o "disjuntor" do próprio LangGraph contra runaway loops (super-steps por execução).
const cfg = (thread) => ({ configurable: { thread_id: thread }, recursionLimit: LIMITES.maxPassos + 2 });

async function rodar(thread, entrada) {
  // streamMode "updates" = monitoramento: vemos cada nó terminar, na ordem, com o que mudou.
  for await (const chunk of await grafo.stream(entrada, { ...cfg(thread), streamMode: 'updates' })) {
    for (const [no, upd] of Object.entries(chunk)) {
      if (no === '__interrupt__') console.log(`  ⏸ interrupt: ${JSON.stringify(upd[0].value)}`);
      else console.log(`  ✓ ${no}${upd?.resposta ? ` -> ${upd.resposta}` : ''}`);
    }
  }
  return grafo.getState(cfg(thread));
}

async function salvarAuditoria(thread) {
  const { values } = await grafo.getState(cfg(thread));
  for (const e of values.auditoria) {
    await pool.query('INSERT INTO m04.auditoria (thread_id, no, decisao, detalhe, ts) VALUES ($1,$2,$3,$4,$5)',
      [thread, e.no, e.decisao, e.detalhe, e.ts]);
  }
  console.log(`  passos=${values.passos} tokens=${values.tokens} resposta="${values.resposta}"`);
}

console.log('\n[A] consulta de saldo (API instável: 2 falhas, retryPolicy resolve)');
await rodar('A', { pedido: 'Qual o saldo da conta 123?' });
await salvarAuditoria('A');

console.log('\n[B] transferência (precisa de aprovação humana)');
let estado = await rodar('B', { pedido: 'Transfira 200 reais da conta 123 para a conta 456' });
console.log(`  grafo pausado; próximo nó: ${estado.next}; checkpoints na thread: ${(await Array.fromAsync(grafo.getStateHistory(cfg('B')))).length}`);
console.log('  operador responde: aprovar');
estado = await rodar('B', new Command({ resume: 'aprovar' })); // retoma do checkpoint, mesma thread
await salvarAuditoria('B');

console.log('\n[C] pedido fora do escopo (guardrail de entrada, sem gastar LLM)');
await rodar('C', { pedido: 'Apague o banco de produção' });
await salvarAuditoria('C');

console.log('\nTrilha de auditoria (m04.auditoria):');
console.table((await pool.query("SELECT thread_id, no, decisao FROM m04.auditoria ORDER BY id")).rows);
console.log(resumoUso());
await pool.end();
