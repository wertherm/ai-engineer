// Exemplo 05 (parte 1) — Indexação: documentos -> chunks -> embeddings -> Postgres/pgvector.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, lerCorpus, chunkPorParagrafo, indexar } from '../../lib/rag.js';

const pasta = join(dirname(fileURLToPath(import.meta.url)), 'corpus');
const db = await conectar();
try {
  const docs = await lerCorpus(pasta);
  const chunks = docs.flatMap(chunkPorParagrafo);
  const t0 = Date.now();
  const n = await indexar(db, 'paragrafo', chunks);
  console.log(`documentos: ${docs.length} | chunks indexados: ${n} | tempo: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const { rows } = await db.query(
    "SELECT fonte, vector_dims(embedding) AS dims, left(conteudo, 60) AS inicio FROM m01.chunks WHERE colecao = 'paragrafo' ORDER BY id LIMIT 3",
  );
  console.table(rows);
} finally {
  await db.end();
}
