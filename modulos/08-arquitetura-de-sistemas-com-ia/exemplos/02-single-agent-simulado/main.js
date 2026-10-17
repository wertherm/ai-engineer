// Exemplo 02 · Single-agent em fluxo linear: Reactive × Memory-Enhanced, com um USUÁRIO SIMULADO.
// Simular o usuário com um roteiro fixo transforma "conversa" em teste reproduzível: mesmas falas,
// arquiteturas diferentes, métricas comparáveis (acerto, tokens, latência).
import { chat } from '../../comum/llm.js';

const ROTEIRO = [
  'Oi, sou a Ana e tenho uma padaria em Recife.',
  'Vendo muito parcelado no cartão. Antecipar recebíveis faz sentido?',
  'Lembra meu nome e meu tipo de negócio?',
];
// Critério de acerto do último turno (o que exige memória).
const lembrou = (resposta) => /ana/i.test(resposta) && /padaria/i.test(resposta);

const SISTEMA = 'Você é um assistente de uma fintech. Responda em português, em no máximo 2 frases.';

// Padrão Reactive: estímulo -> resposta. Sem estado: barato, rápido, previsível, e esquece tudo.
async function reactive(fala) {
  return chat([{ role: 'system', content: SISTEMA }, { role: 'user', content: fala }], { maxTokens: 50 });
}

// Padrão Memory-Enhanced: guarda FATOS extraídos (não o histórico inteiro) e injeta no prompt.
// A extração aqui é uma regra simples; em produção pode ser um LLM barato ou um extrator estruturado.
function criarMemoryEnhanced() {
  const fatos = new Map();
  return async (fala) => {
    const nome = fala.match(/sou (?:a|o) (\p{Lu}\p{Ll}+)/u)?.[1];
    const negocio = fala.match(/tenho uma? (\p{Ll}+)/u)?.[1];
    if (nome) fatos.set('nome', nome);
    if (negocio) fatos.set('negócio', negocio);
    const memoria = [...fatos].map(([k, v]) => `${k}: ${v}`).join('; ') || 'nenhum';
    return chat([{ role: 'system', content: `${SISTEMA}\nFatos conhecidos do cliente: ${memoria}.` }, { role: 'user', content: fala }], { maxTokens: 50 });
  };
}

for (const [nome, agente] of [['reactive', reactive], ['memory-enhanced', criarMemoryEnhanced()]]) {
  console.log(`\n== ${nome} ==`);
  let tokens = 0, ms = 0, ultima = '';
  for (const fala of ROTEIRO) {
    const r = await agente(fala);
    tokens += r.usage.total_tokens;
    ms += r.ms;
    ultima = r.texto;
    console.log(`  usuário: ${fala}\n  agente:  ${r.texto}`);
  }
  console.log(`  → lembrou do contexto? ${lembrou(ultima) ? 'sim' : 'não'} · ${tokens} tokens · ${(ms / 1000).toFixed(0)} s`);
}
