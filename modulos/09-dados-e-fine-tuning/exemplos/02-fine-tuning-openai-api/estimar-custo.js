// Estimativa de tokens e custo de um fine-tuning na OpenAI ANTES de gastar um centavo.
// Executa 100% local: conta tokens com js-tiktoken e multiplica pela tabela de preços.
// Uso: node exemplos/02-fine-tuning-openai-api/estimar-custo.js [epocas] [tickets_por_mes]
import fs from 'node:fs';
import path from 'node:path';
import { DADOS, SYSTEM_PROMPT } from '../../comum/config.js';
import { tokensDaConversa, tokensDoTexto } from '../../comum/tokens.js';

// Preços em US$ por 1M de tokens, copiados de https://developers.openai.com/api/docs/pricing em 2026-10-16.
// Preço muda: confira antes de decidir. "treino" é cobrado por token treinado (tokens do arquivo × épocas).
const PRECOS = {
  'gpt-4.1-2025-04-14': { treino: 25.0, ftInput: 3.0, ftOutput: 12.0, baseInput: 2.0, baseOutput: 8.0 },
  'gpt-4.1-mini-2025-04-14': { treino: 5.0, ftInput: 0.8, ftOutput: 3.2, baseInput: 0.4, baseOutput: 1.6 },
  'gpt-4.1-nano-2025-04-14': { treino: 1.5, ftInput: 0.2, ftOutput: 0.8, baseInput: 0.1, baseOutput: 0.4 },
};

const epocas = Number(process.argv[2] ?? 3); // a OpenAI escolhe "auto"; 3 é um palpite comum para estimar
const ticketsMes = Number(process.argv[3] ?? 100_000);

const ler = (f) => fs.readFileSync(path.join(DADOS, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const treino = ler('treino.jsonl');
const validacao = ler('validacao.jsonl');
const tokTreino = treino.reduce((s, ex) => s + tokensDaConversa(ex.messages), 0);
const tokValid = validacao.reduce((s, ex) => s + tokensDaConversa(ex.messages), 0);

// Na inferência, o modelo fine-tunado só precisa do system prompt curto + ticket (o "jeito" já está nos pesos).
const mediaTicket = treino.reduce((s, ex) => s + tokensDoTexto(ex.messages[1].content), 0) / treino.length;
const inputFt = tokensDoTexto(SYSTEM_PROMPT) + mediaTicket + 10;
// O modelo genérico precisaria de few-shot: o mesmo prompt + 20 exemplos rotulados a cada chamada.
const fewShot = treino.slice(0, 20).map((ex) => `Ticket: ${ex.messages[1].content}\nCategoria: ${ex.messages[2].content}`).join('\n\n');
const inputFewShot = inputFt + tokensDoTexto(fewShot);
const output = 3; // a resposta é só a categoria

const usd = (v) => `US$ ${v.toFixed(v < 1 ? 4 : 2)}`;
console.log(`Treino: ${treino.length} exemplos, ${tokTreino} tokens · Validação: ${validacao.length} exemplos, ${tokValid} tokens`);
console.log(`Tokens treinados (cobrados) = ${tokTreino} × ${epocas} épocas = ${tokTreino * epocas}`);
console.log(`Input por chamada: fine-tunado ~${Math.round(inputFt)} tokens · genérico few-shot (20 exemplos) ~${Math.round(inputFewShot)} tokens\n`);

const linhas = Object.entries(PRECOS).map(([modelo, p]) => {
  const custoTreino = (tokTreino * epocas * p.treino) / 1e6;
  const mesFt = (ticketsMes * (inputFt * p.ftInput + output * p.ftOutput)) / 1e6;
  const mesBase = (ticketsMes * (inputFewShot * p.baseInput + output * p.baseOutput)) / 1e6;
  return { modelo, treino: usd(custoTreino), [`ft ${ticketsMes}/mês`]: usd(mesFt), [`base few-shot ${ticketsMes}/mês`]: usd(mesBase), 'economia/mês': usd(mesBase - mesFt) };
});
console.table(linhas);
console.log('Obs.: estimativa. O valor real vem em `trained_tokens` do job; a validação NÃO é cobrada como treino.');
