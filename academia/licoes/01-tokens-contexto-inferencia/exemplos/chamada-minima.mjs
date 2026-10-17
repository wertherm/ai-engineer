// Exemplo 1 · A menor chamada de LLM possível: um POST HTTP e o campo `usage`.
// Sem SDK, sem dependências (Node 22+). Funciona com qualquer endpoint compatível com a API de chat da OpenAI:
//   Ollama local (padrão), vLLM, OpenRouter, OpenAI... Só as variáveis de ambiente mudam.
//
//   node academia/licoes/01-tokens-contexto-inferencia/exemplos/chamada-minima.mjs

const baseURL = process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1';
const apiKey = process.env.OPENAI_API_KEY ?? 'ollama';
const modelo = process.env.MODELO_CHAT ?? 'qwen3.5:4b';
// OpenAI atual usa `max_completion_tokens`; Ollama, vLLM e OpenRouter aceitam `max_tokens`. Confira o seu provedor.
const paramLimite = process.env.PARAM_MAX_TOKENS ?? 'max_tokens';

const corpo = {
  model: modelo,
  messages: [{ role: 'user', content: 'Diga "olá" em uma palavra.' }],
  temperature: 0,
  [paramLimite]: 16,
  // O qwen3.5 do Ollama "pensa" antes de responder e esses tokens contam como saída (veja modulos/01 · lib/llm.js).
  ...(baseURL.includes(':11434') ? { reasoning_effort: 'none' } : {}),
};

const t0 = Date.now();
const resposta = await fetch(`${baseURL}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
  body: JSON.stringify(corpo),
  signal: AbortSignal.timeout(300_000),
});
const ms = Date.now() - t0;

if (!resposta.ok) {
  console.error(`HTTP ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
  process.exit(1);
}

const json = await resposta.json();
console.log('texto          :', JSON.stringify(json.choices[0].message.content));
console.log('finish_reason  :', json.choices[0].finish_reason);
console.log('usage          :', json.usage);
console.log('latência       :', ms, 'ms');
