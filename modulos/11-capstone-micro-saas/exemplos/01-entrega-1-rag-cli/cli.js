// Entrega 1 · protótipo do RAG em linha de comando: valida a lógica (chunking, busca, citações,
// agente) ANTES de existir API ou interface. O CLI é uma ferramenta de operador: escolhe o tenant
// pelo id (a API, na entrega 2, escolhe pela API key).
//
//   node exemplos/01-entrega-1-rag-cli/cli.js indexar
//   node exemplos/01-entrega-1-rag-cli/cli.js buscar acme "limite de alimentação em viagem"
//   node exemplos/01-entrega-1-rag-cli/cli.js perguntar acme "Posso dividir minhas férias?"
//   node exemplos/01-entrega-1-rag-cli/cli.js perguntar acme "<pergunta complexa>" --agente
import { criarPool, migrar } from '../../app/src/db.js';
import { criarLlm } from '../../app/src/llm.js';
import { criarServico } from '../../app/src/servico.js';
import { seed } from '../../app/src/seed.js';

const [comando, tenantId, ...resto] = process.argv.slice(2);
const agente = resto.includes('--agente');
const texto = resto.filter((r) => r !== '--agente').join(' ');

const pool = criarPool();
const llm = criarLlm();
const servico = criarServico({ pool, llm, log: (m) => console.log(m) });

async function tenantPorId(id) {
  const { rows } = await pool.query('SELECT id, nome FROM m11.tenants WHERE id = $1', [id]);
  if (!rows[0]) throw new Error(`tenant "${id}" não existe (rode: ... cli.js indexar)`);
  return rows[0];
}

try {
  await migrar(pool);
  if (comando === 'indexar') {
    await seed(pool, llm);
  } else if (comando === 'buscar') {
    const tenant = await tenantPorId(tenantId);
    const trechos = await servico.buscar(tenant, texto, { k: 3, canal: 'cli' });
    console.log(`Tenant: ${tenant.nome} · consulta: "${texto}"`);
    for (const [i, t] of trechos.entries()) {
      console.log(`  ${i + 1}. [${t.fonte}] sim=${t.sim.toFixed(3)} rrf=${t.rrf.toFixed(4)} · ${t.conteudo.slice(0, 90)}...`);
    }
  } else if (comando === 'perguntar') {
    const tenant = await tenantPorId(tenantId);
    console.log(`Tenant: ${tenant.nome} · modo: ${agente ? 'agente' : 'rag'}\nPergunta: ${texto}`);
    const r = await servico.perguntar(tenant, texto, { modo: agente ? 'agente' : 'rag', canal: 'cli' });
    console.log(`\nResposta: ${r.resposta}`);
    for (const c of r.citacoes) console.log(`  ${c.n ? `[${c.n}] ` : ''}${c.fonte}${c.trecho ? ` · ${c.trecho.slice(0, 80)}...` : ''}`);
    console.log(`verificado=${r.verificado}${r.motivoBloqueio ? ` (bloqueio: ${r.motivoBloqueio})` : ''} · cache=${r.cache} · ${(r.ms / 1000).toFixed(1)}s${r.tokens ? ` · ${r.tokens} tokens` : ''}`);
  } else {
    console.log('uso: cli.js indexar | buscar <tenant> "<consulta>" | perguntar <tenant> "<pergunta>" [--agente]');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
