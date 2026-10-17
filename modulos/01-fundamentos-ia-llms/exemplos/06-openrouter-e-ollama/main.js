// Exemplo 06 — Open-source local (Ollama) x catálogo multi-modelo (OpenRouter), mesmo código.
// Parte 1 (executa sempre): modelos locais no Ollama + catálogo PÚBLICO do OpenRouter (GET sem chave).
// Parte 2 (só com OPENROUTER_API_KEY): a mesma pergunta em vários modelos, com fallback.
import OpenAI from 'openai';
import { chat, config } from '../../lib/llm.js';

// ---------- 1a. Ollama: o que está rodando localmente ----------
const ollamaRaiz = config.baseURL.replace(/\/v1\/?$/, '');
const { models } = await (await fetch(`${ollamaRaiz}/api/tags`)).json(); // API nativa do Ollama
console.log('Modelos locais no Ollama (pesos abertos, rodando na SUA máquina):');
for (const m of models) {
  const d = m.details;
  console.log(`  ${m.name.padEnd(22)} ${d.parameter_size.padStart(8)} params | ${d.quantization_level} | ${(m.size / 1e9).toFixed(1)} GB`);
}

const pergunta = 'Em uma frase: o que é um embedding?';
const local = await chat([{ role: 'user', content: pergunta }], { maxTokens: 60 });
console.log(`\n[ollama ${config.modeloChat}] ${local.texto.trim()}`);
console.log(`  -> ${local.usage.completion_tokens} tokens em ${(local.ms / 1000).toFixed(1)}s | custo: R$ 0 (energia da sua máquina)`);

// ---------- 1b. OpenRouter: catálogo público, sem chave ----------
const catalogo = (await (await fetch('https://openrouter.ai/api/v1/models')).json()).data;
const porMilhao = (m, campo) => Number(m.pricing[campo]) * 1e6; // preço vem em US$ por token
const gratis = catalogo.filter((m) => m.id.endsWith(':free'));
console.log(`\nOpenRouter: ${catalogo.length} modelos no catálogo, ${gratis.length} com variante :free`);
const interessantes = ['anthropic/claude-haiku-5.5', 'google/gemini-3.5-flash-lite', 'deepseek/deepseek-v4.1-flash', 'google/gemma-4-31b-it'];
for (const id of interessantes) {
  const m = catalogo.find((x) => x.id === id);
  if (m) console.log(`  ${id.padEnd(30)} entrada US$ ${porMilhao(m, 'prompt').toFixed(2)}/M tok | saída US$ ${porMilhao(m, 'completion').toFixed(2)}/M tok | contexto ${m.context_length}`);
}

// ---------- 2. Mesma pergunta em vários modelos via OpenRouter ----------
if (!process.env.OPENROUTER_API_KEY) {
  console.log('\n[parte 2 pulada] defina OPENROUTER_API_KEY para comparar modelos remotos (não executado localmente).');
} else {
  const openrouter = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY });
  const alvos = (process.env.OPENROUTER_MODELOS ?? 'google/gemma-4-31b-it,deepseek/deepseek-v4.1-flash,anthropic/claude-haiku-5.5').split(',');
  for (const model of alvos) {
    const t0 = Date.now();
    const r = await openrouter.chat.completions.create({
      model,
      // `models` é extensão do OpenRouter: se o primeiro falhar/estiver fora, tenta os próximos.
      models: [model, 'deepseek/deepseek-v4.1-flash'],
      messages: [{ role: 'user', content: pergunta }],
      max_tokens: 60,
      temperature: 0,
    });
    console.log(`\n[${r.model}] ${r.choices[0].message.content.trim()} (${Date.now() - t0} ms, ${r.usage.total_tokens} tok)`);
  }
}
