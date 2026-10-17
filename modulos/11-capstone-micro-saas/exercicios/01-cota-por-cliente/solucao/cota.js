// Solução do exercício 01: cota DIÁRIA de perguntas ao LLM por cliente (tenant), conforme o plano.
// Diferente do rate limit (protege o servidor de rajadas, por minuto), a cota protege a MARGEM do
// Micro-SaaS: cada pergunta custa tokens, e o plano free não pode consumir como o pro.

/** Contador em memória (testes e 1 réplica). `agora` injetável para testar a virada do dia. */
export function criarContadorMemoria({ agora = () => new Date() } = {}) {
  const usos = new Map();
  return {
    async incrementar(tenantId) {
      const chave = `${tenantId}:${agora().toISOString().slice(0, 10)}`;
      usos.set(chave, (usos.get(chave) ?? 0) + 1);
      return usos.get(chave);
    },
    async consultar(tenantId) {
      return usos.get(`${tenantId}:${agora().toISOString().slice(0, 10)}`) ?? 0;
    },
  };
}

/**
 * Contador no Postgres (N réplicas da API compartilham o mesmo número). O UPSERT com RETURNING é
 * atômico: duas requisições simultâneas nunca leem o mesmo valor (sem "read-then-write").
 */
export async function criarContadorPg(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS m11.uso_diario (
    tenant_id text NOT NULL, dia date NOT NULL, perguntas int NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, dia))`);
  return {
    async incrementar(tenantId) {
      const { rows } = await pool.query(
        `INSERT INTO m11.uso_diario (tenant_id, dia, perguntas) VALUES ($1, current_date, 1)
         ON CONFLICT (tenant_id, dia) DO UPDATE SET perguntas = m11.uso_diario.perguntas + 1
         RETURNING perguntas`,
        [tenantId],
      );
      return rows[0].perguntas;
    },
    async consultar(tenantId) {
      const { rows } = await pool.query('SELECT perguntas FROM m11.uso_diario WHERE tenant_id = $1 AND dia = current_date', [tenantId]);
      return rows[0]?.perguntas ?? 0;
    },
  };
}

/**
 * Gancho para o buildApp (parâmetro `ganchos`): roda DEPOIS da autenticação (req.tenant existe) e só
 * conta POST /v1/perguntas. Expõe também GET /v1/uso para o cliente acompanhar o consumo.
 */
export function cotaDiaria(contador) {
  return async (v1) => {
    v1.addHook('preHandler', async (req, reply) => {
      if (req.method !== 'POST' || req.routeOptions.url !== '/v1/perguntas') return;
      const limite = req.tenant.cotaDiaria ?? 50;
      const usadas = await contador.incrementar(req.tenant.id);
      reply.header('X-Cota-Limite', String(limite));
      reply.header('X-Cota-Restante', String(Math.max(0, limite - usadas)));
      if (usadas > limite) {
        // 429 com mensagem de NEGÓCIO (upgrade de plano), não só "tente depois".
        return reply.code(429).send({ erro: `cota diária do plano ${req.tenant.plano} esgotada (${limite} perguntas). Faça upgrade ou aguarde até amanhã.` });
      }
    });
    v1.get('/uso', async (req) => ({
      tenant: req.tenant.id, plano: req.tenant.plano, limite: req.tenant.cotaDiaria, usadasHoje: await contador.consultar(req.tenant.id),
    }));
  };
}
