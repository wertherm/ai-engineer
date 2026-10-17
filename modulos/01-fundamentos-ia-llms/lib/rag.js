// Peças de um RAG mínimo com Postgres + pgvector. Usado pelo exemplo 05 e pelo exercício 02.
import pg from 'pg';
import pgvector from 'pgvector/pg';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config, embed } from './llm.js';

export const DIM = 1024; // qwen3-embedding:0.6b gera vetores de 1024 posições

export async function conectar() {
  const db = new pg.Client({ connectionString: config.databaseUrl });
  await db.connect();
  await pgvector.registerTypes(db); // ensina o driver a converter o tipo `vector` <-> array JS
  // Cada módulo do repo usa o PRÓPRIO schema; nunca o public.
  await db.query('CREATE SCHEMA IF NOT EXISTS m01');
  await db.query(`
    CREATE TABLE IF NOT EXISTS m01.chunks (
      id        bigserial PRIMARY KEY,
      colecao   text NOT NULL,            -- permite guardar estratégias de chunking diferentes lado a lado
      fonte     text NOT NULL,            -- arquivo de origem (para citar na resposta)
      conteudo  text NOT NULL,
      embedding vector(${DIM}) NOT NULL
    )`);
  // HNSW: índice aproximado (ANN) para distância de cosseno. Com 20 linhas não faz diferença;
  // com milhões, é o que separa milissegundos de segundos.
  await db.query('CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON m01.chunks USING hnsw (embedding vector_cosine_ops)');
  return db;
}

// Lê os .md de uma pasta -> [{ fonte, titulo, texto }]
export async function lerCorpus(pasta) {
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith('.md')).sort();
  return Promise.all(
    arquivos.map(async (f) => {
      const texto = await readFile(join(pasta, f), 'utf8');
      const titulo = texto.split('\n')[0].replace(/^#\s*/, '');
      return { fonte: f, titulo, texto };
    }),
  );
}

// Chunking por parágrafo. Cada pedaço leva o título do documento: sem ele, um parágrafo como
// "O limite é de R$ 90 por dia" perde o contexto ("limite de quê?") e o embedding fica pior.
export function chunkPorParagrafo(doc) {
  return doc.texto
    .split(/\n\s*\n/)
    .slice(1) // descarta a linha do título (já vai como prefixo)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ fonte: doc.fonte, conteudo: `${doc.titulo}: ${p}` }));
}

export async function indexar(db, colecao, chunks) {
  await db.query('DELETE FROM m01.chunks WHERE colecao = $1', [colecao]); // idempotente: reindexa do zero
  const vetores = await embed(chunks.map((c) => c.conteudo)); // 1 chamada em lote
  for (let i = 0; i < chunks.length; i++) {
    await db.query('INSERT INTO m01.chunks (colecao, fonte, conteudo, embedding) VALUES ($1, $2, $3, $4)', [
      colecao,
      chunks[i].fonte,
      chunks[i].conteudo,
      pgvector.toSql(vetores[i]),
    ]);
  }
  return chunks.length;
}

// Busca semântica: `<=>` é a distância de cosseno do pgvector (0 = mesma direção).
// similaridade = 1 - distância.
export async function buscar(db, colecao, pergunta, k = 3) {
  const [v] = await embed([pergunta]);
  const { rows } = await db.query(
    `SELECT fonte, conteudo, 1 - (embedding <=> $1) AS similaridade
       FROM m01.chunks WHERE colecao = $2
      ORDER BY embedding <=> $1 LIMIT $3`,
    [pgvector.toSql(v), colecao, k],
  );
  return rows;
}
