// Teste A/B: modelo genérico (base) × customizado (LoRA) no MESMO conjunto de validação, pela API OpenAI local.
// Mede acurácia (exact match), adequação de formato (resposta é uma categoria válida?), consistência
// (2ª chamada igual à 1ª?) e recall por categoria; checa perda de generalização com perguntas fora do domínio.
// Loga cada predição em resultados/ab-<data>.jsonl e o resumo em resultados/resumo.csv.
// Pré-requisito: servidor_openai.py no ar (porta 30900).
import fs from 'node:fs';
import path from 'node:path';
import { criarCliente, LORA_BASE_URL, CATEGORIAS, SYSTEM_PROMPT, DADOS } from '../../comum/config.js';

const MODELOS = ['smollm2-base', 'smollm2-suporte-lora'];
const PASTA = path.join(path.dirname(new URL(import.meta.url).pathname), 'resultados');
const client = criarCliente({ baseURL: LORA_BASE_URL, apiKey: 'local' });

const validacao = fs.readFileSync(path.join(DADOS, 'validacao.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
// Fora do domínio: o modelo genérico deveria responder algo útil; o customizado tende a "forçar" uma categoria.
const foraDoDominio = ['Qual é a capital da França?', 'Escreva uma frase de boas-vindas para um cliente novo.', 'Quanto é 2 + 2?'];

async function perguntar(modelo, mensagens, maxTokens = 8) {
  const r = await client.chat.completions.create({ model: modelo, messages: mensagens, max_tokens: maxTokens, temperature: 0 });
  return r.choices[0].message.content.trim();
}

fs.mkdirSync(PASTA, { recursive: true });
const log = path.join(PASTA, `ab-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jsonl`);
const resumo = [];

for (const modelo of MODELOS) {
  let acertos = 0, validos = 0, consistentes = 0;
  const porCat = Object.fromEntries(CATEGORIAS.map((c) => [c, { total: 0, acertos: 0 }]));
  const t0 = Date.now();
  for (const ex of validacao) {
    const msgs = ex.messages.slice(0, 2);
    const esperado = ex.messages[2].content;
    const previsto = await perguntar(modelo, msgs);
    const repetido = await perguntar(modelo, msgs); // consistência: mesma entrada, mesma saída?
    const normal = previsto.toLowerCase().replace(/[^a-z]/g, '');
    const ok = normal === esperado;
    acertos += ok; validos += CATEGORIAS.includes(normal); consistentes += previsto === repetido;
    porCat[esperado].total++; porCat[esperado].acertos += ok;
    fs.appendFileSync(log, JSON.stringify({ modelo, ticket: msgs[1].content, esperado, previsto, ok }) + '\n');
  }
  const n = validacao.length;
  const linha = {
    modelo, n, acuracia: +(acertos / n).toFixed(3), formato_valido: +(validos / n).toFixed(3),
    consistencia: +(consistentes / n).toFixed(3), segundos: Math.round((Date.now() - t0) / 1000),
    ...Object.fromEntries(CATEGORIAS.map((c) => [`recall_${c}`, +(porCat[c].acertos / porCat[c].total).toFixed(2)])),
  };
  resumo.push(linha);
}

console.table(resumo.map(({ modelo, n, acuracia, formato_valido, consistencia, segundos }) => ({ modelo, n, acuracia, formato_valido, consistencia, segundos })));
console.log('Recall por categoria:');
console.table(resumo.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k === 'modelo' || k.startsWith('recall_')))));

// Exemplos lado a lado (os 4 primeiros) para a análise QUALITATIVA.
const linhas = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
console.log('Exemplos (base × LoRA):');
for (const ex of validacao.slice(0, 4)) {
  const t = ex.messages[1].content;
  const [b, l] = MODELOS.map((m) => linhas.find((x) => x.modelo === m && x.ticket === t).previsto);
  console.log(`- "${t.slice(0, 60)}" esperado=${ex.messages[2].content} | base="${b.slice(0, 30)}" | lora="${l}"`);
}

// Generalização: pergunta fora do domínio SEM o system prompt de classificação.
console.log('\nFora do domínio (sem system prompt):');
for (const q of foraDoDominio) {
  const [b, l] = await Promise.all(MODELOS.map((m) => perguntar(m, [{ role: 'user', content: q }], 20)));
  console.log(`- ${q}\n    base: ${b.replace(/\s+/g, ' ')}\n    lora: ${l.replace(/\s+/g, ' ')}`);
  fs.appendFileSync(log, JSON.stringify({ tipo: 'fora_do_dominio', pergunta: q, base: b, lora: l }) + '\n');
}

const cab = Object.keys(resumo[0]);
const csv = path.join(PASTA, 'resumo.csv');
if (!fs.existsSync(csv)) fs.writeFileSync(csv, ['data', ...cab].join(',') + '\n');
for (const r of resumo) fs.appendFileSync(csv, [new Date().toISOString(), ...cab.map((k) => r[k])].join(',') + '\n');
console.log(`\nlog por predição: ${path.relative(process.cwd(), log)} · resumo acumulado: ${path.relative(process.cwd(), csv)}`);
console.log(`(system prompt usado: "${SYSTEM_PROMPT.slice(0, 50)}...")`);
