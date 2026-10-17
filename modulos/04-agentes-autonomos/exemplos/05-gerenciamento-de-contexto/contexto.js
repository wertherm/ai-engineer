// Ferramentas de gerenciamento de contexto, todas puras (sem LLM), exceto sumarizar().
import { chat } from '../../comum/llm.js';

// Estimativa barata de tokens (~4 caracteres por token em PT/EN). Para orçamento basta;
// a conta exata vem depois em usage.prompt_tokens.
export const estimarTokens = (msgs) => msgs.reduce((t, m) => t + Math.ceil((m.content ?? '').length / 4) + 4, 0);

/** Pruning 1: encurta resultados de ferramenta antigos (são os maiores e envelhecem rápido). */
export function podarToolsAntigas(msgs, { manterUltimas = 2, maxChars = 80 } = {}) {
  const idxTools = msgs.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  const antigas = new Set(idxTools.slice(0, -manterUltimas));
  return msgs.map((m, i) => (antigas.has(i) && m.content.length > maxChars
    ? { ...m, content: `${m.content.slice(0, maxChars)}… [podado]` } : m));
}

/** Pruning 2: janela deslizante — mantém as mensagens mais recentes que cabem no orçamento. */
export function janela(msgs, orcamento) {
  const out = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (estimarTokens([...out, msgs[i]]) > orcamento) break;
    out.unshift(msgs[i]);
  }
  return out;
}

/** Sumarização: comprime o que saiu da janela num parágrafo (1 chamada ao LLM). */
export async function sumarizar(msgs) {
  const texto = msgs.map((m) => `${m.role}: ${m.content}`).join('\n');
  const { msg } = await chat([
    { role: 'system', content: 'Resuma a conversa em até 3 linhas, preservando números, ids e decisões.' },
    { role: 'user', content: texto },
  ], { maxTokens: 90 });
  return msg.content.trim();
}

/**
 * Stitching: costura o contexto ATIVO a partir de pedaços de origens diferentes, em ordem fixa:
 * global (system + objetivo) -> fatos fixados -> resumo do passado -> contexto local -> janela recente.
 */
export function costurar({ global, fatos = [], resumo, local = [], recentes }) {
  const blocos = [global];
  if (fatos.length) blocos.push(`Fatos fixados:\n${fatos.map((f) => `- ${f}`).join('\n')}`);
  if (resumo) blocos.push(`Resumo do que já aconteceu: ${resumo}`);
  if (local.length) blocos.push(`Contexto local desta etapa:\n${local.map((l) => `- ${l}`).join('\n')}`);
  return [{ role: 'system', content: blocos.join('\n\n') }, ...recentes];
}
