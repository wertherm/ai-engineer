// PONTO DE PARTIDA do exercício 02: agente LINEAR (uma função atrás da outra).
// Problema: se a API de frete cair, tudo explode; não há retry, fallback nem visibilidade dos passos.
import { chat, extrairJson } from '../../../comum/llm.js';

export async function apiFrete(cep, { falhar = false } = {}) {
  if (falhar) throw new Error('504 Gateway Timeout (simulado)');
  return cep.startsWith('0') ? 25 : 40;
}

export async function agenteLinear(pedido, opcoes = {}) {
  const { msg } = await chat([
    { role: 'system', content: 'Extraia do pedido. Devolva só JSON {"produto":"...","quantidade":n,"cep":"somente dígitos"}.' },
    { role: 'user', content: pedido },
  ], { maxTokens: 50 });
  const dados = extrairJson(msg.content);
  const frete = await apiFrete(dados.cep, opcoes); // <- ponto único de falha
  return `${dados.quantidade}x ${dados.produto}, frete R$ ${frete}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(await agenteLinear('Quero 2 cadeiras entregues no CEP 01310-100'));
}
