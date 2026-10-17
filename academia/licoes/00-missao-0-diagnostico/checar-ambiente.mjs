// Missão 0 · Confere se o seu ambiente consegue fazer o que as lições pedem.
//   - Node 22 ou superior (o repositório usa Node 24; o Node 22 também serve para a Academia)
//   - git instalado
//   - um endpoint de chat compatível com a API da OpenAI respondendo (Ollama local, vLLM, OpenRouter, OpenAI...)
//
//   node academia/licoes/00-missao-0-diagnostico/checar-ambiente.mjs
//
// Variáveis (as mesmas de infra/.env.example): OPENAI_BASE_URL, OPENAI_API_KEY, MODELO_CHAT, PARAM_MAX_TOKENS.
// A chave nunca é impressa. Cole a saída em academia/alunos/<aluno>/entregas/etapa-00/ambiente.md.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const baseURL = process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1';
const apiKey = process.env.OPENAI_API_KEY ?? 'ollama';
const modelo = process.env.MODELO_CHAT ?? 'qwen3.5:4b';
const paramLimite = process.env.PARAM_MAX_TOKENS ?? 'max_tokens';

const resultados = [];
// Nada que vá para a tela pode conter credenciais: mensagens de erro do fetch costumam repetir a URL inteira.
const limpar = (texto) => {
  let t = String(texto).replace(/\/\/[^/\s@]+@/g, '//***@');
  if (apiKey.length >= 4) t = t.split(apiKey).join('***');
  return t;
};
const registrar = (id, titulo, ok, detalhe, obrigatorio = true) =>
  resultados.push({ id, titulo, ok, detalhe: limpar(detalhe), obrigatorio });

// CA1 · Node
const [maior] = process.versions.node.split('.').map(Number);
registrar('CA1', 'Node 22 ou superior', maior >= 22, `Node ${process.version}`);

// git (recomendado: o fluxo de sessões usa Git, mas dá para editar pela interface do GitHub)
try {
  const { stdout } = await exec('git', ['--version']);
  registrar('GIT', 'git instalado', true, stdout.trim(), false);
} catch {
  registrar('GIT', 'git instalado', false, 'git não encontrado (opcional, mas recomendado)', false);
}

// Endereço sem credenciais, para poder colar a saída sem expor nada.
let alvo = baseURL;
try {
  const u = new URL(baseURL);
  alvo = `${u.protocol}//${u.host}${u.pathname}`;
  if (u.username || u.password) registrar('URL', 'URL sem usuário/senha', false, 'remova credenciais da OPENAI_BASE_URL');
} catch {
  registrar('CA2', 'OPENAI_BASE_URL é uma URL válida', false, `valor inválido: ${baseURL}`);
}

// Modelos disponíveis (informativo: nem todo servidor expõe /models)
try {
  const r = await fetch(`${baseURL}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
  if (r.ok) {
    const ids = (await r.json()).data?.map((m) => m.id) ?? [];
    registrar('MODELOS', 'lista de modelos (/models)', ids.includes(modelo) || ids.length === 0,
      ids.includes(modelo) ? `${modelo} disponível (${ids.length} modelos)` : `${modelo} não está na lista (${ids.length} modelos)`, false);
  } else {
    registrar('MODELOS', 'lista de modelos (/models)', true, `HTTP ${r.status}: servidor não expõe a lista (ok)`, false);
  }
} catch (e) {
  registrar('MODELOS', 'lista de modelos (/models)', false, `sem resposta: ${e.cause?.code ?? e.message}`, false);
}

// CA2 · uma chamada de chat de verdade
try {
  const t0 = performance.now();
  const r = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: 'Responda apenas: ok' }],
      temperature: 0,
      [paramLimite]: 16,
      ...(baseURL.includes(':11434') ? { reasoning_effort: 'none' } : {}),
    }),
    signal: AbortSignal.timeout(Number(process.env.TIMEOUT_MS ?? 300_000)),
  });
  const ms = Math.round(performance.now() - t0);
  if (!r.ok) {
    const corpo = (await r.text()).slice(0, 200).replace(/\s+/g, ' ');
    registrar('CA2', 'chamada de chat responde', false, `HTTP ${r.status}: ${corpo}`);
  } else {
    const j = await r.json();
    const u = j.usage;
    const temUsage = Number.isInteger(u?.prompt_tokens) && u.prompt_tokens > 0;
    registrar('CA2', 'chamada de chat responde com `usage`', temUsage,
      temUsage ? `${modelo} · prompt_tokens=${u.prompt_tokens} completion_tokens=${u.completion_tokens} · ${ms} ms`
        : 'a resposta não trouxe `usage.prompt_tokens`; as lições dependem desse campo');
  }
} catch (e) {
  registrar('CA2', 'chamada de chat responde', false, `sem resposta de ${alvo}: ${e.cause?.code ?? e.message}`);
}

// Aviso de configuração
const remoto = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test((() => { try { return new URL(baseURL).hostname; } catch { return ''; } })());
if (remoto && apiKey === 'ollama') {
  registrar('CHAVE', 'chave de API configurada', false, 'endpoint remoto com a chave padrão "ollama": defina OPENAI_API_KEY', false);
}

console.log(`Missão 0 · checagem de ambiente\nendpoint: ${alvo}\nmodelo  : ${modelo}\n`);
for (const r of resultados) {
  const marca = r.ok ? '[ok]    ' : r.obrigatorio ? '[falhou]' : '[aviso] ';
  console.log(`${marca} ${r.id} · ${r.titulo} — ${r.detalhe}`);
}
const falhas = resultados.filter((r) => !r.ok && r.obrigatorio);
console.log(falhas.length ? `\n${falhas.length} item(ns) obrigatório(s) a resolver (veja as dicas da Missão 0).` : '\nAmbiente pronto para a Lição 1.');
process.exit(falhas.length ? 1 : 0);
