// Ponto de entrada da API (local ou no container): migra o schema, monta as dependências reais e sobe.
import { config } from './config.js';
import { criarPool, migrar } from './db.js';
import { criarLlm } from './llm.js';
import { criarServico } from './servico.js';
import { criarAutenticador } from './tenants.js';
import { buildApp } from './api.js';

const pool = criarPool();
await migrar(pool);

const app = await buildApp({
  servico: criarServico({ pool, llm: criarLlm() }),
  autenticar: criarAutenticador(pool),
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});
// Encerramento gracioso: termina as requisições em curso e fecha o pool (docker stop manda SIGTERM).
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
await app.listen({ port: config.porta, host: config.host });
