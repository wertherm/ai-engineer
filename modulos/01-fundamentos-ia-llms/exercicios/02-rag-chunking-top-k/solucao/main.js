// Solução do exercício 02 — medir o RETRIEVAL do RAG com estratégias de chunking e top-k diferentes.
// Só usa embeddings (sem LLM gerando texto): rápido e determinístico.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, lerCorpus, chunkPorParagrafo, indexar, buscar } from '../../../lib/rag.js';

const corpus = join(dirname(fileURLToPath(import.meta.url)), '../../../exemplos/05-primeiro-rag/corpus');

// Estratégias de chunking -----------------------------------------------------------------
const estrategias = {
  // Documento inteiro: nunca corta a resposta, mas manda texto demais para o LLM (custo + ruído).
  documento: (doc) => [{ fonte: doc.fonte, conteudo: doc.texto }],
  // Parágrafo + título (a do exemplo 05).
  paragrafo: chunkPorParagrafo,
  // Janela fixa de 160 caracteres com sobreposição de 40, SEM título: corta frases no meio.
  janela160: (doc) => {
    const corpo = doc.texto.split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim();
    const out = [];
    for (let i = 0; i < corpo.length; i += 120) out.push({ fonte: doc.fonte, conteudo: corpo.slice(i, i + 160) });
    return out;
  },
};

// Conjunto de avaliação: pergunta -> trecho que PRECISA aparecer no contexto recuperado.
// Note que as perguntas usam palavras diferentes do texto (é aí que busca semântica brilha).
const avaliacao = [
  { q: 'Quanto posso gastar por dia com comida numa viagem a trabalho?', resposta: 'R$ 90' },
  { q: 'Posso tirar férias na semana antes do Natal?', resposta: '24 de dezembro' },
  { q: 'Com quanto tempo de antecedência peço férias?', resposta: '45 dias' },
  { q: 'Posso subir código para produção na sexta à tarde?', resposta: 'congelamento' },
  { q: 'Como desfaço um deploy que deu errado?', resposta: 'esteira rollback' },
  { q: 'A loja caiu, em quanto tempo precisa ter a sala de guerra?', resposta: '15 minutos' },
  { q: 'Quanto ganho a mais por estar de sobreaviso?', resposta: '20%' },
  { q: 'Quando a máquina de café fica fora de uso?', resposta: 'sexta às 17h' },
  { q: 'Quando recebo acesso ao ambiente de produção?', resposta: '90 dias' },
  { q: 'Tem leite sem lactose para o café?', resposta: 'aveia' },
];

const db = await conectar();
try {
  const docs = await lerCorpus(corpus);
  const linhas = [];
  for (const [nome, fn] of Object.entries(estrategias)) {
    const colecao = `ex02-${nome}`;
    const n = await indexar(db, colecao, docs.flatMap(fn));
    for (const k of [1, 3]) {
      let hits = 0, rrSoma = 0, chars = 0;
      for (const { q, resposta } of avaliacao) {
        const top = await buscar(db, colecao, q, k);
        // posição (1-based) do primeiro chunk que contém a resposta
        const pos = top.findIndex((t) => t.conteudo.includes(resposta)) + 1;
        if (pos > 0) { hits++; rrSoma += 1 / pos; }
        chars += top.reduce((s, t) => s + t.conteudo.length, 0);
      }
      linhas.push({
        chunking: nome, chunks: n, k,
        'hit@k': `${hits}/${avaliacao.length}`,
        MRR: (rrSoma / avaliacao.length).toFixed(2),
        'contexto médio (chars)': Math.round(chars / avaliacao.length),
      });
    }
  }
  console.table(linhas);
  console.log('hit@k = a resposta estava em algum dos k trechos | MRR = média de 1/posição do 1º trecho certo');
} finally {
  await db.end();
}
