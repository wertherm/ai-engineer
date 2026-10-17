// Projeto final: agente de atendimento que integra o modelo customizado num fluxo real.
//   1. triagem com o LoRA (barato, rápido, local, formato garantido pelo treino)
//   2. guardrail: se a saída não for uma categoria válida, cai para "humano" (nunca inventa rota)
//   3. resposta ao cliente com o LLM genérico (qwen3.5:4b) usando instruções da categoria
//   4. registro de cada atendimento no Postgres (schema m09) para auditoria e reavaliação futura
// Pré-requisitos: servidor_openai.py no ar (porta 30900), Ollama e Postgres da infra.
// Uso: node exemplos/05-projeto-final-triagem/agente.js [--sem-resposta]  (pula o passo 3 se o Ollama estiver lento)
import pg from 'pg';
import { criarCliente, LORA_BASE_URL, MODELO_CHAT, CATEGORIAS, SYSTEM_PROMPT, DATABASE_URL, SCHEMA, extrasOllama } from '../../comum/config.js';

const semResposta = process.argv.includes('--sem-resposta');
const lora = criarCliente({ baseURL: LORA_BASE_URL, apiKey: 'local' });
const llm = criarCliente();

// Tickets NOVOS (sintéticos, nunca vistos no treino).
const tickets = [
  'Oi! Fiz o pagamento por pix ontem e o site ainda diz que estou devendo.',
  'O liquidificador que comprei veio com a jarra rachada.',
];

// Instruções por categoria: o fine-tuning cuidou da TRIAGEM; o tom e a política ficam no prompt (fácil de mudar).
const politica = {
  cobranca: 'Peça o comprovante e informe prazo de 2 dias úteis para conferência.',
  acesso: 'Oriente a redefinir a senha pelo link "Esqueci minha senha" e a checar o spam.',
  entrega: 'Peça o número do pedido e informe que o rastreio será verificado com a transportadora.',
  defeito: 'Ofereça troca ou reembolso e peça uma foto do produto.',
  cancelamento: 'Confirme o pedido a cancelar e informe o prazo de estorno de até 7 dias.',
};

async function triar(texto) {
  const r = await lora.chat.completions.create({
    model: 'smollm2-suporte-lora', max_tokens: 8, temperature: 0,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: texto }],
  });
  const cat = r.choices[0].message.content.trim().toLowerCase();
  return CATEGORIAS.includes(cat) ? cat : 'humano'; // guardrail
}

async function responder(texto, categoria) {
  if (semResposta || categoria === 'humano') return null;
  const r = await llm.chat.completions.create({
    model: MODELO_CHAT, max_tokens: 80, temperature: 0, ...extrasOllama,
    messages: [
      { role: 'system', content: `Você é o atendente da Loja Exemplo. Responda em 2 frases, em português, cordial. ${politica[categoria]}` },
      { role: 'user', content: texto },
    ],
  });
  return r.choices[0].message.content.trim();
}

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
await db.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.atendimentos (
  id serial PRIMARY KEY, criado_em timestamptz DEFAULT now(), ticket text NOT NULL,
  categoria text NOT NULL, modelo_triagem text NOT NULL, resposta text, ms_triagem int, ms_resposta int)`);

for (const texto of tickets) {
  let t0 = Date.now();
  const categoria = await triar(texto);
  const msTriagem = Date.now() - t0;
  t0 = Date.now();
  const resposta = await responder(texto, categoria);
  const msResposta = resposta ? Date.now() - t0 : null;
  await db.query(
    `INSERT INTO ${SCHEMA}.atendimentos (ticket, categoria, modelo_triagem, resposta, ms_triagem, ms_resposta) VALUES ($1,$2,$3,$4,$5,$6)`,
    [texto, categoria, 'smollm2-suporte-lora', resposta, msTriagem, msResposta],
  );
  console.log(`\nticket: ${texto}\n  triagem (LoRA): ${categoria} em ${msTriagem} ms`);
  console.log(resposta ? `  resposta (${MODELO_CHAT}, ${Math.round(msResposta / 1000)} s): ${resposta}` : '  resposta: (pulada)');
}

const { rows } = await db.query(`SELECT categoria, count(*)::int AS n FROM ${SCHEMA}.atendimentos GROUP BY 1 ORDER BY 1`);
console.log('\natendimentos registrados em m09.atendimentos:', rows);
await db.end();
