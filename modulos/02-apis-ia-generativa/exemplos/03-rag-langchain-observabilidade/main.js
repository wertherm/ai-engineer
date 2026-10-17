// RAG orquestrado com LangChain.js (LCEL) + pgvector + retentativas com backoff + logs JSON.
//
//   pergunta ─► rag.recuperar (embedding + busca no pgvector) ─► rag.prompt ─► rag.llm (withRetry) ─► texto
//
// Para ver as retentativas funcionando sem derrubar nada, injetamos falhas: as primeiras
// FALHAS chamadas ao chat devolvem HTTP 503 (como um provedor sobrecarregado).
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableLambda, RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import pg from "pg";
import pgvector from "pgvector/pg";
import { API_KEY, BASE_URL, DATABASE_URL, fetchSemTimeout, MODELO_CHAT, MODELO_EMBED, SCHEMA } from "../../comum/config.js";
import { DOCUMENTOS } from "./corpus.js";
import { LogJson } from "./observabilidade.js";

const pergunta = process.argv[2] ?? "Comprei um fone há 10 dias. Ainda posso trocar?";
let falhasRestantes = Number(process.env.FALHAS ?? 2);

// fetch "sabotado": devolve 503 nas primeiras chamadas ao /chat/completions.
const fetchComFalhas = async (url, init) => {
  if (String(url).endsWith("/chat/completions") && falhasRestantes-- > 0) {
    return new Response(JSON.stringify({ error: { message: "servidor sobrecarregado (falha injetada)" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  return fetchSemTimeout(url, init); // sem o corte de 300 s do fetch nativo (ver comum/config.js)
};

const embeddings = new OpenAIEmbeddings({ model: MODELO_EMBED, apiKey: API_KEY, configuration: { baseURL: BASE_URL } });
const llm = new ChatOpenAI({
  model: MODELO_CHAT,
  apiKey: API_KEY,
  temperature: 0,
  maxTokens: 60,
  maxRetries: 0, // desliga a retentativa interna: quem decide é o withRetry abaixo (evita retry em dobro)
  modelKwargs: { reasoning_effort: "none" },
  configuration: { baseURL: BASE_URL, fetch: fetchComFalhas },
});

// --- Ingestão (idempotente) no schema m02 ---------------------------------------------
const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
await pgvector.registerTypes(db);
await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
await db.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.rag_chunks (
  id serial PRIMARY KEY, fonte text UNIQUE, texto text, embedding vector(1024))`);
const { rows: [{ n }] } = await db.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.rag_chunks`);
if (n < DOCUMENTOS.length) {
  const vetores = await embeddings.embedDocuments(DOCUMENTOS.map((d) => d.texto));
  for (const [i, d] of DOCUMENTOS.entries()) {
    await db.query(
      `INSERT INTO ${SCHEMA}.rag_chunks (fonte, texto, embedding) VALUES ($1, $2, $3) ON CONFLICT (fonte) DO NOTHING`,
      [d.fonte, d.texto, pgvector.toSql(vetores[i])],
    );
  }
  console.log(`ingestão: ${DOCUMENTOS.length} documentos indexados em ${SCHEMA}.rag_chunks`);
}

// --- Passos da chain -------------------------------------------------------------------
const recuperar = RunnableLambda.from(async (q) => {
  const v = await embeddings.embedQuery(q);
  const { rows } = await db.query(
    `SELECT fonte, texto, 1 - (embedding <=> $1) AS similaridade
       FROM ${SCHEMA}.rag_chunks ORDER BY embedding <=> $1 LIMIT 2`,
    [pgvector.toSql(v)],
  );
  console.log(JSON.stringify({ evento: "recuperados", docs: rows.map((r) => `${r.fonte}:${r.similaridade.toFixed(3)}`) }));
  // Citar a fonte no contexto permite pedir ao modelo que cite: resposta auditável, menos alucinação.
  return rows.map((r) => `[${r.fonte}] ${r.texto}`).join("\n");
}).withConfig({ runName: "rag.recuperar" });

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "Responda em 1 frase usando SÓ o contexto e cite a fonte entre colchetes. Se não estiver no contexto, diga 'não sei'.\nContexto:\n{contexto}"],
  ["human", "{pergunta}"],
]).withConfig({ runName: "rag.prompt" });

// withRetry: backoff exponencial com jitter (p-retry por baixo). onFailedAttempt é o gancho
// para logar — retentativa silenciosa esconde incidentes e estoura a latência sem ninguém ver.
// ATENÇÃO à ordem: withConfig() DEPOIS de withRetry() recria o binding e descarta
// stopAfterAttempt/onFailedAttempt (volta ao padrão: 3 tentativas, sem log). Nomeie antes.
let tentativa = 0;
const llmResiliente = llm.withConfig({ runName: "rag.llm" }).withRetry({
  stopAfterAttempt: 4,
  onFailedAttempt: (erro) => {
    tentativa++;
    const status = erro.status ?? erro.response?.status;
    console.log(JSON.stringify({ evento: "retentativa", tentativa, status, erro: erro.message.slice(0, 50) }));
    // Erro do cliente (4xx, exceto 429) não melhora tentando de novo: lançar aqui aborta o retry.
    if (status && status >= 400 && status < 500 && status !== 429) throw erro;
  },
});

const chain = RunnableSequence.from([
  { contexto: recuperar, pergunta: new RunnablePassthrough() },
  prompt,
  llmResiliente,
  new StringOutputParser(),
]).withConfig({ runName: "rag.chain" });

console.log(`pergunta: ${pergunta}  (falhas injetadas: ${falhasRestantes})`);
const resposta = await chain.invoke(pergunta, { callbacks: [new LogJson()] });
console.log(`\nresposta: ${resposta.trim()}`);
await db.end();
