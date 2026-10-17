// Fachada do Micro-SaaS: a ÚNICA camada de regra de negócio. CLI, API REST, servidor MCP e agentes
// ADK chamam estas funções; nenhum deles fala com o banco ou com o LLM diretamente.
// Assim o comportamento (isolamento por tenant, PII, cache, auditoria) é igual em todos os canais.
import pgvector from 'pgvector';
import { buscarHibrida, FALLBACK, indexarDocumento, montarMensagens, paraConsulta, verificarResposta } from './rag.js';
import { executarAgente } from './agente.js';
import { mascarar } from './pii.js';

export const VERSAO_PROMPT = 'v1';
const LIMIAR_CACHE = 0.95; // cosseno mínimo para tratar como "a mesma pergunta" (módulo 08)
// Se nem o MELHOR trecho passa deste cosseno, o assunto não está nas políticas: responde o fallback
// sem gastar LLM (medido no corpus: perguntas fora do tema ficam em ~0,33-0,41; dentro, acima de 0,55).
const LIMIAR_RELEVANCIA = 0.5;

export function criarServico({ pool, llm, log = () => {} }) {
  async function auditar(tenant, canal, acao, detalhe) {
    await pool.query('INSERT INTO m11.auditoria (tenant_id, canal, acao, detalhe) VALUES ($1, $2, $3, $4)', [
      tenant.id, canal, acao, JSON.stringify(detalhe),
    ]);
  }

  async function embedConsulta(texto) {
    const [v] = await llm.embed([paraConsulta(texto)]);
    return v;
  }

  return {
    async listarDocumentos(tenant) {
      const { rows } = await pool.query(
        'SELECT fonte, min(titulo) AS titulo, count(*)::int AS chunks FROM m11.chunks WHERE tenant_id = $1 GROUP BY fonte ORDER BY fonte',
        [tenant.id],
      );
      return rows;
    },

    async indexar(tenant, { fonte, texto }, { canal = 'rest' } = {}) {
      const chunks = await indexarDocumento(pool, llm, tenant.id, { fonte, texto });
      await pool.query('DELETE FROM m11.cache WHERE tenant_id = $1', [tenant.id]); // política mudou: cache do tenant inválido
      await auditar(tenant, canal, 'indexar', { fonte, chunks });
      return { fonte, chunks };
    },

    async remover(tenant, fonte, { canal = 'rest' } = {}) {
      const { rowCount } = await pool.query('DELETE FROM m11.chunks WHERE tenant_id = $1 AND fonte = $2', [tenant.id, fonte]);
      // Respostas em cache podem citar o documento removido. Só invalida se algo saiu de fato: um DELETE de
      // arquivo inexistente (404) não pode custar ao cliente o cache inteiro.
      if (rowCount) await pool.query('DELETE FROM m11.cache WHERE tenant_id = $1', [tenant.id]);
      await auditar(tenant, canal, 'remover', { fonte, chunks: rowCount });
      return { fonte, removidos: rowCount };
    },

    /** Só recuperação (sem LLM de chat): rápido, determinístico, bom para tools MCP e para avaliação. */
    async buscar(tenant, consulta, { k = 4, canal = 'rest', emb } = {}) {
      const { texto } = mascarar(consulta); // PII nunca vai para o provedor de embeddings
      const vetor = emb ?? (await embedConsulta(texto));
      const trechos = await buscarHibrida(pool, tenant.id, texto, vetor, k);
      await auditar(tenant, canal, 'buscar', { consulta: texto, fontes: trechos.map((t) => t.fonte) });
      return trechos;
    },

    /** Pergunta respondida pelo RAG (modo "rag") ou pelo agente com RAG como ferramenta (modo "agente"). */
    async perguntar(tenant, pergunta, { modo = 'rag', canal = 'rest', k = 4 } = {}) {
      const t0 = Date.now();
      const { texto: perguntaSegura, contagem } = mascarar(pergunta);
      if (Object.keys(contagem).length) log(`[pii] mascarado antes do LLM: ${JSON.stringify(contagem)}`);

      if (modo === 'agente') {
        const r = await executarAgente({ servico: this, llm, tenant, pergunta: perguntaSegura, log });
        const saida = {
          resposta: r.resposta ?? FALLBACK,
          modo,
          citacoes: r.fontes.map((fonte) => ({ fonte })),
          verificado: r.verificado,
          passos: r.passos,
          cache: false,
          ms: Date.now() - t0,
        };
        await auditar(tenant, canal, 'perguntar', { pergunta: perguntaSegura, modo, ms: saida.ms, fontes: r.fontes });
        return saida;
      }

      // 1) Um embedding por pergunta, reaproveitado no cache e na busca.
      const emb = await embedConsulta(perguntaSegura);
      const embSql = pgvector.toSql(emb);

      // 2) Cache semântico POR TENANT (a mesma pergunta em outra empresa tem outra resposta!).
      const { rows: [viz] } = await pool.query(
        `SELECT resposta, 1 - (emb <=> $1::vector) AS sim FROM m11.cache
          WHERE tenant_id = $2 AND versao = $3 AND criado_em > now() - interval '1 day'
          ORDER BY emb <=> $1::vector LIMIT 1`,
        [embSql, tenant.id, VERSAO_PROMPT],
      );
      if (viz && viz.sim >= LIMIAR_CACHE) {
        const saida = { ...viz.resposta, cache: true, ms: Date.now() - t0 };
        await auditar(tenant, canal, 'perguntar', { pergunta: perguntaSegura, cache: true, ms: saida.ms });
        return saida;
      }

      // 3) Recuperação híbrida dentro do tenant + corte por relevância.
      const trechos = await this.buscar(tenant, perguntaSegura, { k, canal, emb });
      if (!trechos.length || Math.max(...trechos.map((t) => t.sim)) < LIMIAR_RELEVANCIA) {
        return { resposta: FALLBACK, modo, citacoes: [], verificado: true, cache: false, ms: Date.now() - t0, tokens: 0 };
      }

      // 4) Geração com fontes numeradas + 5) verificação das citações (falha fechado).
      const { msg, usage } = await llm.chat(montarMensagens(tenant.nome, perguntaSegura, trechos), { maxTokens: 140 });
      const verif = verificarResposta(msg.content, trechos.length);
      const resposta = verif.ok ? msg.content.trim() : FALLBACK;
      const saida = {
        resposta,
        modo,
        citacoes: verif.ok
          ? verif.citacoes.map((n) => ({ n, fonte: trechos[n - 1].fonte, trecho: trechos[n - 1].conteudo }))
          : [],
        verificado: verif.ok,
        motivoBloqueio: verif.ok ? undefined : verif.motivo,
        cache: false,
        tokens: (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
        ms: Date.now() - t0,
      };
      if (verif.ok) {
        await pool.query('INSERT INTO m11.cache (tenant_id, versao, pergunta, emb, resposta) VALUES ($1, $2, $3, $4::vector, $5)', [
          tenant.id, VERSAO_PROMPT, perguntaSegura, embSql, JSON.stringify(saida),
        ]);
      }
      await auditar(tenant, canal, 'perguntar', {
        pergunta: perguntaSegura, modo, ms: saida.ms, tokens: saida.tokens, verificado: verif.ok, motivo: verif.motivo,
      });
      return saida;
    },
  };
}
