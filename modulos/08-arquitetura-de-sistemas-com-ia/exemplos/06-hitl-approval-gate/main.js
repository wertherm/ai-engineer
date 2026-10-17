// Exemplo 06 · Human-in-the-Loop: Approval Gate por limiar de confiança + política + Audit Trail consultável.
import { readFileSync } from 'node:fs';
import { criarPool, tabela } from '../../comum/llm.js';
import { avaliar } from './gate.js';
import { criarAuditoria, registrar, verificarCadeia } from './auditoria.js';

const politica = JSON.parse(readFileSync(new URL('./politica.json', import.meta.url)));

// Ações que um agente de cobrança "propôs" (no mundo real, saída estruturada do LLM + score de confiança
// vindo de um classificador calibrado ou de concordância entre modelos, não do LLM se autoavaliando).
const PROPOSTAS = [
  { id: 'a1', tipo: 'reenviar_boleto', valor: 320, confianca: 0.97 },
  { id: 'a2', tipo: 'conceder_desconto', valor: 900, confianca: 0.62 },
  { id: 'a3', tipo: 'conceder_desconto', valor: 12000, confianca: 0.95 },
  { id: 'a4', tipo: 'cancelar_operacao', valor: 0, confianca: 0.99 },
  { id: 'a5', tipo: 'excluir_cliente', valor: 0, confianca: 0.99 },
];
// Decisões do revisor humano (numa UI real, viriam de um formulário; aqui são roteirizadas).
const REVISOR = { a2: { aprova: false, nota: 'cliente já teve desconto no mês' }, a3: { aprova: true, nota: 'acordo da diretoria' }, a4: { aprova: true, nota: 'pedido formal do cliente' } };

const pool = await criarPool();
await criarAuditoria(pool);

const linhas = [];
for (const acao of PROPOSTAS) {
  await registrar(pool, { ator: 'agente-cobranca', evento: 'proposta', acaoId: acao.id, dados: acao });
  const { decisao, motivo } = avaliar(acao, politica);
  await registrar(pool, { ator: 'gate', evento: decisao, acaoId: acao.id, dados: { motivo, politica: politica.versao } });
  let final = decisao === 'automatica' ? 'executada' : decisao === 'bloqueada' ? 'bloqueada' : null;
  if (decisao === 'pendente') {
    const r = REVISOR[acao.id];
    await registrar(pool, { ator: 'humano:ana', evento: r.aprova ? 'aprovada' : 'rejeitada', acaoId: acao.id, dados: { nota: r.nota } });
    final = r.aprova ? 'executada' : 'rejeitada';
  }
  if (final === 'executada') await registrar(pool, { ator: 'executor', evento: 'executada', acaoId: acao.id, dados: {} });
  linhas.push({ acao: `${acao.id} ${acao.tipo}`, valor: acao.valor, conf: acao.confianca, gate: decisao, motivo, final });
}
console.log(tabela(linhas));

// Audit trail consultável: "quem decidiu o quê sobre a ação a3, e com base em qual política?"
const { rows } = await pool.query(
  `SELECT seq, to_char(em, 'HH24:MI:SS') AS hora, ator, evento, dados::text FROM m08.auditoria WHERE acao_id = $1 ORDER BY seq`, ['a3']);
console.log('\nTrilha da ação a3:');
rows.forEach((r) => console.log(`  #${r.seq} ${r.ator.padEnd(15)} ${r.evento.padEnd(9)} ${r.dados}`));

const tot = await pool.query(`SELECT evento, count(*)::int AS n FROM m08.auditoria GROUP BY evento ORDER BY evento`);
console.log('\nEventos por tipo:', JSON.stringify(Object.fromEntries(tot.rows.map((r) => [r.evento, r.n]))));
console.log('Cadeia íntegra?', (await verificarCadeia(pool)) === null ? 'sim' : 'NÃO');

// Tentativa de adulteração: o trigger barra.
try {
  await pool.query(`UPDATE m08.auditoria SET ator = 'ninguem' WHERE acao_id = 'a3'`);
} catch (err) {
  console.log(`UPDATE na auditoria → erro: ${err.message}`);
}
// Mesmo com o trigger desligado (quem tem permissão de DDL), a cadeia de hash denuncia.
await pool.query('ALTER TABLE m08.auditoria DISABLE TRIGGER auditoria_imutavel');
await pool.query(`UPDATE m08.auditoria SET dados = '{"nota":"aprovado por ninguém"}' WHERE acao_id = 'a3' AND evento = 'aprovada'`);
await pool.query('ALTER TABLE m08.auditoria ENABLE TRIGGER auditoria_imutavel');
console.log(`Depois de adulterar com o trigger desligado → primeira seq inválida: #${await verificarCadeia(pool)}`);
await pool.end();
