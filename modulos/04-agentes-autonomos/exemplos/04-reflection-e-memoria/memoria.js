// Memory store de longo prazo no pgvector (schema m04). Cada memória tem um TIPO:
//   - longa:     fatos/preferências estáveis do usuário ("prefiro respostas em tópicos")
//   - episodica: o que aconteceu numa execução e a lição aprendida (reflexão)
// Recuperação por similaridade de embeddings (distância de cosseno, operador <=>).
import { embed, vetor } from '../../comum/llm.js';

export async function prepararTabela(pool, { zerar = false } = {}) {
  if (zerar) await pool.query('DROP TABLE IF EXISTS m04.memorias');
  await pool.query(`CREATE TABLE IF NOT EXISTS m04.memorias (
    id serial PRIMARY KEY,
    tipo text NOT NULL CHECK (tipo IN ('longa', 'episodica')),
    conteudo text NOT NULL,
    embedding vector(1024) NOT NULL,
    criada_em timestamptz NOT NULL DEFAULT now())`);
}

export async function lembrar(pool, tipo, conteudo) {
  const [e] = await embed([conteudo]);
  await pool.query('INSERT INTO m04.memorias (tipo, conteudo, embedding) VALUES ($1, $2, $3::vector)', [tipo, conteudo, vetor(e)]);
}

/** Top-k memórias mais parecidas com a consulta, com limiar de distância (evita "lembrar" lixo). */
export async function recuperar(pool, consulta, { k = 3, distanciaMax = 0.6 } = {}) {
  const [e] = await embed([consulta]);
  const { rows } = await pool.query(
    `SELECT tipo, conteudo, round((embedding <=> $1::vector)::numeric, 3) AS distancia
       FROM m04.memorias ORDER BY embedding <=> $1::vector LIMIT $2`, [vetor(e), k]);
  return rows.filter((r) => Number(r.distancia) <= distanciaMax);
}
