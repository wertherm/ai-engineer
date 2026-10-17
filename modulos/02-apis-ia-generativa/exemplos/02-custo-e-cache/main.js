// Custo e cache com números reais: (A) tokens de um prompt prolixo vs enxuto,
// (B) reuso de contexto (prefix caching do servidor) e (C) cache de respostas no Postgres.
import { criarCliente, MODELO_CHAT, PADRAO } from "../../comum/config.js";
import { abrirCache, chaveDe, comCache } from "./cache-respostas.js";

const cliente = criarCliente();

// Preços ILUSTRATIVOS em US$ por 1 milhão de tokens. Troque pelos da página de preços do seu
// provedor; o modelo local custa US$ 0 por token (você paga em hardware e energia).
const PRECO = { entrada: 0.4, entradaEmCache: 0.1, saida: 1.6 };
const custo = (u) => {
  const cache = u.prompt_tokens_details?.cached_tokens ?? 0;
  return ((u.prompt_tokens - cache) * PRECO.entrada + cache * PRECO.entradaEmCache + u.completion_tokens * PRECO.saida) / 1e6;
};
const fmt = (u) =>
  `entrada=${u.prompt_tokens} (cache=${u.prompt_tokens_details?.cached_tokens ?? 0}) saida=${u.completion_tokens} custo=US$ ${custo(u).toFixed(6)}`;

async function chamar(messages, maxTokens) {
  const inicio = Date.now();
  const r = await cliente.chat.completions.create({ ...PADRAO, model: MODELO_CHAT, max_tokens: maxTokens, messages });
  return { texto: r.choices[0].message.content.trim(), usage: r.usage, ms: Date.now() - inicio };
}

// --- A) Redução de tokens: mesma tarefa, dois prompts. ---------------------------------
console.log("A) Prompt prolixo vs enxuto (max_tokens=1: só medimos a entrada)");
const prolixo =
  "Olá! Espero que você esteja bem. Eu gostaria muito, se possível, que você pudesse por gentileza me ajudar " +
  "com uma tarefa bem simples que eu tenho aqui. Preciso que você leia com bastante atenção a frase que vou " +
  "colocar logo abaixo e, depois de pensar com calma, me diga se o sentimento dela é positivo, negativo ou neutro. " +
  "Muito obrigado desde já pela ajuda!\nFrase: 'O produto chegou quebrado.'";
const enxuto = "Sentimento (positivo/negativo/neutro) de: 'O produto chegou quebrado.'";
for (const [nome, p] of [["prolixo", prolixo], ["enxuto", enxuto]]) {
  const r = await chamar([{ role: "user", content: p }], 1);
  console.log(`   ${nome.padEnd(8)} ${fmt(r.usage)}`);
}

// --- B) Reuso de contexto: prefixo fixo primeiro, parte variável no fim. ----------------
// O servidor guarda o KV cache do prefixo já processado. Se a 2ª requisição começa igual,
// ele pula esse trecho (OpenAI chama de "prompt caching"; o Ollama devolve cached_tokens).
console.log("\nB) Reuso de contexto (mesmo system prompt, perguntas diferentes)");
const politicas = Array.from(
  { length: 30 },
  (_, i) => `Política ${i + 1}: trocas em até ${7 + i} dias para a categoria ${i + 1}, com nota fiscal.`,
).join("\n");
const system = `Você é o suporte da Loja Exemplo. Responda com no máximo 10 palavras.\n${politicas}`;
for (const pergunta of ["Prazo de troca da categoria 3?", "Prazo de troca da categoria 9?"]) {
  const r = await chamar([{ role: "system", content: system }, { role: "user", content: pergunta }], 15);
  console.log(`   ${pergunta} → ${r.ms} ms · ${fmt(r.usage)}`);
}

// --- C) Cache de respostas no Postgres. ------------------------------------------------
console.log("\nC) Cache de respostas (Postgres, schema m02)");
const db = await abrirCache();
const requisicao = {
  ...PADRAO,
  model: MODELO_CHAT,
  max_tokens: 20,
  messages: [{ role: "user", content: "Capital do Brasil? Responda só o nome." }],
};
// Limpa a chave desta demo para a 1ª chamada sempre ser um "miss".
await db.query("DELETE FROM m02.cache_respostas WHERE chave = $1", [chaveDe(requisicao)]);
for (let i = 1; i <= 2; i++) {
  const inicio = Date.now();
  const { resposta, hit } = await comCache(db, requisicao, async (req) => {
    const r = await cliente.chat.completions.create(req);
    return { texto: r.choices[0].message.content.trim(), usage: r.usage };
  });
  const tokens = hit ? 0 : resposta.usage.total_tokens;
  console.log(`   chamada ${i}: ${hit ? "HIT " : "MISS"} ${Date.now() - inicio} ms · tokens cobrados=${tokens} · "${resposta.texto}"`);
}
await db.end();
