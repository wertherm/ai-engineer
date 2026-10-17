// As três estratégias de recuperação, todas com a MESMA assinatura: (pool, pergunta, embPergunta, k) -> ids.
// Com 12 documentos não precisamos de índice HNSW (busca exata é instantânea); em produção, crie um.

/** RAG Basic: só similaridade de cosseno (<=> é distância de cosseno no pgvector). */
export async function buscaVetorial(pool, _q, emb, k, indice = null) {
  const { rows } = await pool.query(
    `SELECT id FROM m08.rag_docs WHERE ($3::text IS NULL OR indice = $3)
     ORDER BY emb <=> $1::vector LIMIT $2`,
    [emb, k, indice],
  );
  return rows.map((r) => r.id);
}

/**
 * Hybrid Search: vetorial + full-text (tsvector) fundidos por RRF (Reciprocal Rank Fusion):
 *   score(d) = soma de 1 / (60 + posição de d em cada lista).
 * RRF usa só a POSIÇÃO, então não precisa normalizar escalas diferentes (cosseno × ts_rank).
 * A consulta full-text vira um OR dos lexemas da pergunta (websearch_to_tsquery faria AND, restritivo demais).
 */
export async function buscaHibrida(pool, q, emb, k, indice = null) {
  const { rows } = await pool.query(
    `WITH consulta AS (
       SELECT to_tsquery('portuguese', array_to_string(tsvector_to_array(to_tsvector('portuguese', $2)), ' | ')) AS tq),
     vet AS (
       SELECT id, row_number() OVER (ORDER BY emb <=> $1::vector) AS pos
       FROM m08.rag_docs WHERE ($4::text IS NULL OR indice = $4) ORDER BY emb <=> $1::vector LIMIT 20),
     txt AS (
       SELECT id, row_number() OVER (ORDER BY ts_rank_cd(tsv, tq) DESC) AS pos
       FROM m08.rag_docs, consulta WHERE tsv @@ tq AND ($4::text IS NULL OR indice = $4)
       ORDER BY ts_rank_cd(tsv, tq) DESC LIMIT 20)
     SELECT id, sum(1.0 / (60 + pos)) AS rrf FROM (
       SELECT id, pos, 'vet' AS fonte FROM vet UNION ALL SELECT id, pos, 'txt' FROM txt) u
     -- Desempate explícito: em RRF, "1º num ranking + 2º no outro" EMPATA com "2º + 1º".
     -- Preferimos o melhor no full-text (termo exato), senão a ordem dependeria do acaso.
     GROUP BY id ORDER BY rrf DESC, min(pos) FILTER (WHERE fonte = 'txt') NULLS LAST LIMIT $3`,
    [emb, q, k, indice],
  );
  return rows.map((r) => r.id);
}

/**
 * Multi-Index federado (fan-out): busca em CADA índice separadamente e funde as listas por RRF.
 * Não depende de acertar o índice; custa uma consulta por índice.
 */
export async function buscaMultiIndiceFederada(pool, q, emb, k) {
  const listas = await Promise.all(['politicas', 'produtos'].map((ind) => buscaHibrida(pool, q, emb, k, ind)));
  const rrf = new Map();
  for (const ids of listas) ids.forEach((id, pos) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (60 + pos + 1)));
  // Empate entre os primeiros de cada índice: desempata pela busca híbrida global (ordem de relevância real).
  const global = await buscaHibrida(pool, q, emb, 2 * k);
  return [...rrf.keys()].sort((a, b) => rrf.get(b) - rrf.get(a) || global.indexOf(a) - global.indexOf(b)).slice(0, k);
}

/**
 * Multi-Index roteado: primeiro ROTEIA a pergunta para o índice certo (similaridade com a descrição de cada índice),
 * depois faz a busca híbrida só dentro dele. Ganha precisão quando índices diferentes têm vocabulário parecido
 * e permite configurar cada índice de um jeito (chunking, modelo de embedding, permissão de acesso).
 */
export function criarBuscaMultiIndice(embIndices) {
  const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b));
  return async (pool, q, emb, k) => {
    const [indice] = Object.entries(embIndices).sort(([, a], [, b]) => cos(JSON.parse(emb), b) - cos(JSON.parse(emb), a))[0];
    return buscaHibrida(pool, q, emb, k, indice);
  };
}
