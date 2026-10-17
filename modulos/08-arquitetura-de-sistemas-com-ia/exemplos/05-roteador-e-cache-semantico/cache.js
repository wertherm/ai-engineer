// Semantic Cache no pgvector: reaproveita a resposta de uma pergunta PARECIDA (não só idêntica).
import { embed, vetor } from '../../comum/llm.js';

// Instrução de "perguntas equivalentes" (não de "trechos que respondem"): queremos paráfrases, não temas.
const paraCache = (q) => `Instruct: Given a question, retrieve semantically equivalent questions\nQuery: ${q}`;

export class CacheSemantico {
  /** limiar = similaridade de cosseno mínima para considerar "a mesma pergunta". */
  constructor(pool, { limiar = 0.9, versaoPrompt = 'v1' } = {}) {
    Object.assign(this, { pool, limiar, versaoPrompt });
  }
  async iniciar({ limpar = true } = {}) {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS m08.cache_semantico (
      id bigserial PRIMARY KEY, versao_prompt text NOT NULL, pergunta text NOT NULL, emb vector(1024) NOT NULL,
      resposta text NOT NULL, tier text NOT NULL, prompt_tokens int, completion_tokens int,
      criado_em timestamptz NOT NULL DEFAULT now())`);
    if (limpar) await this.pool.query('TRUNCATE m08.cache_semantico');
  }
  /** Devolve { hit, sim, vizinho, emb }. O emb volta para ser reaproveitado no gravar (1 embedding por pedido). */
  async buscar(pergunta) {
    const [e] = await embed([paraCache(pergunta)]);
    const emb = vetor(e);
    // A versão do prompt entra na chave: mudou o prompt do sistema, as respostas antigas não valem mais.
    // O TTL (1 dia) evita servir resposta velha sobre dado que muda (taxa, cotação...).
    const { rows } = await this.pool.query(
      `SELECT pergunta, resposta, tier, prompt_tokens, completion_tokens, 1 - (emb <=> $1::vector) AS sim
       FROM m08.cache_semantico WHERE versao_prompt = $2 AND criado_em > now() - interval '1 day'
       ORDER BY emb <=> $1::vector LIMIT 1`,
      [emb, this.versaoPrompt],
    );
    const viz = rows[0];
    return { hit: !!viz && viz.sim >= this.limiar, sim: viz?.sim ?? 0, vizinho: viz, emb };
  }
  async gravar(pergunta, emb, resposta, tier, usage) {
    await this.pool.query(
      `INSERT INTO m08.cache_semantico (versao_prompt, pergunta, emb, resposta, tier, prompt_tokens, completion_tokens)
       VALUES ($1, $2, $3::vector, $4, $5, $6, $7)`,
      [this.versaoPrompt, pergunta, emb, resposta, tier, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0],
    );
  }
}
