// Prepara o ambiente de demonstração: migra o schema m11, cria os 2 tenants e indexa os documentos.
// Idempotente: pode rodar quantas vezes quiser. Uso: npm run seed
import { criarPool, migrar } from './db.js';
import { criarLlm } from './llm.js';
import { criarServico } from './servico.js';
import { salvarTenant, TENANTS_DEMO } from './tenants.js';
import { lerDocumentos } from './corpus.js';

export async function seed(pool, llm, log = console.log) {
  await migrar(pool);
  const servico = criarServico({ pool, llm });
  for (const t of TENANTS_DEMO) {
    await salvarTenant(pool, t);
    for (const doc of await lerDocumentos(t.id)) {
      const r = await servico.indexar(t, doc, { canal: 'seed' });
      log(`[seed] ${t.id.padEnd(8)} ${r.fonte.padEnd(28)} ${r.chunks} chunks`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = criarPool();
  const t0 = Date.now();
  await seed(pool, criarLlm());
  console.log(`[seed] pronto em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await pool.end();
}
