// Exemplo 05 (parte 2) — Pergunta: busca semântica (retrieval) + geração aumentada (generation).
// Uso: node exemplos/05-primeiro-rag/perguntar.js "sua pergunta" [--sem-rag]
import { conectar, buscar } from '../../lib/rag.js';
import { chat } from '../../lib/llm.js';

const pergunta = process.argv[2] ?? 'Até quando posso pedir reembolso de um almoço de viagem e qual o limite?';
const compararSemRag = process.argv.includes('--sem-rag');
const K = 3;

const db = await conectar();
try {
  // 1) RETRIEVAL: os K trechos mais parecidos (em significado, não em palavras) com a pergunta
  const trechos = await buscar(db, 'paragrafo', pergunta, K);
  console.log(`Pergunta: ${pergunta}\n\nTop-${K} trechos (similaridade de cosseno):`);
  trechos.forEach((t, i) => console.log(`  [${i + 1}] ${Number(t.similaridade).toFixed(3)} ${t.fonte} — ${t.conteudo.slice(0, 80)}...`));

  // 2) AUGMENTED: o prompt carrega o contexto e regras de "não invente"
  const contexto = trechos.map((t, i) => `[${i + 1}] (${t.fonte}) ${t.conteudo}`).join('\n');
  const mensagens = [
    {
      role: 'system',
      content:
        'Responda em português, em no máximo 2 frases, usando SOMENTE o contexto. ' +
        'Cite as fontes como [1], [2]. Se o contexto não tiver a resposta, diga "não sei".',
    },
    { role: 'user', content: `Contexto:\n${contexto}\n\nPergunta: ${pergunta}` },
  ];

  // 3) GENERATION
  const r = await chat(mensagens, { maxTokens: 90 });
  console.log(`\nResposta COM RAG (${(r.ms / 1000).toFixed(1)}s, ${r.usage.prompt_tokens} tokens de entrada):\n${r.texto}`);

  if (compararSemRag) {
    const s = await chat([{ role: 'user', content: `Responda em no máximo 2 frases. ${pergunta}` }], { maxTokens: 90 });
    console.log(`\nResposta SEM RAG (o modelo não conhece a Café Byte):\n${s.texto}`);
  }
} finally {
  await db.end();
}
