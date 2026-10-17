// Contexto ativo sob orçamento de tokens: mostra o que a janela ingênua perde e como
// pruning + sumarização + stitching (+ contexto compartilhado global/local) preservam o essencial.
import { chat, resumoUso } from '../../comum/llm.js';
import { estimarTokens, podarToolsAntigas, janela, sumarizar, costurar } from './contexto.js';

const ORCAMENTO = 220; // tokens estimados para o histórico (pequeno de propósito)

// Histórico longo de um agente de suporte: o fato importante (pedido 8812) aparece só no começo.
const historico = [
  { role: 'user', content: 'Oi, sou a Ana da Padaria Pão Quente. Meu pedido 8812 de 40 caixas de farinha não chegou.' },
  { role: 'assistant', content: 'Vou verificar o pedido 8812.' },
  { role: 'tool', content: JSON.stringify({ pedido: 8812, status: 'em trânsito', transportadora: 'RodoSul', eventos: Array.from({ length: 8 }, (_, i) => `evento ${i + 1}: centro de distribuição ${i + 1}`) }) },
  { role: 'assistant', content: 'O pedido está em trânsito pela RodoSul.' },
];
for (let i = 1; i <= 6; i++) {
  historico.push({ role: 'user', content: `Pergunta extra ${i}: e sobre o horário de entrega da semana ${i}?` });
  historico.push({ role: 'tool', content: JSON.stringify({ semana: i, janelas: ['08h-10h', '14h-16h'], observacao: 'sujeito a confirmação da transportadora parceira' }) });
  historico.push({ role: 'assistant', content: `Na semana ${i} as entregas são 08h-10h ou 14h-16h.` });
}
const pergunta = { role: 'user', content: 'Qual é o número do meu pedido e quantas caixas eram? Responda em uma frase.' };
const SYSTEM = 'Você é o agente de suporte. Responda só com base no contexto; se não souber, diga "não sei".';

console.log(`Histórico completo: ${historico.length} mensagens, ~${estimarTokens(historico)} tokens (orçamento: ${ORCAMENTO})`);

// 1) Pruning de resultados de tool antigos.
const podado = podarToolsAntigas(historico);
console.log(`Após podar tools antigas: ~${estimarTokens(podado)} tokens`);

// 2) Janela ingênua: só o que cabe no orçamento, do fim para o começo.
const recentes = janela(podado, ORCAMENTO);
const descartadas = podado.slice(0, podado.length - recentes.length);
console.log(`Janela: mantém ${recentes.length} mensagens recentes, descarta ${descartadas.length} antigas`);

// 3) Contexto compartilhado entre agentes: GLOBAL (todos veem) x LOCAL (só a etapa atual).
const quadro = {
  global: { cliente: 'Padaria Pão Quente', objetivo: 'resolver atraso de entrega' },
  local: { suporte: ['Política: atraso > 5 dias dá frete grátis no próximo pedido.'], financeiro: ['Limite de crédito: R$ 5.000.'] },
};

// Versão A: só a janela (o fato do pedido sumiu).
const ingenuo = [{ role: 'system', content: SYSTEM }, ...recentes, pergunta];
// Versão B: resumo do que saiu + fatos fixados + contexto local do agente de suporte.
const resumo = await sumarizar(descartadas);
console.log(`\nResumo das ${descartadas.length} mensagens descartadas: ${resumo}`);
const costurado = costurar({
  global: `${SYSTEM}\nCliente: ${quadro.global.cliente}. Objetivo: ${quadro.global.objetivo}.`,
  fatos: ['Pedido principal: 8812'],
  resumo,
  local: quadro.local.suporte, // o agente de suporte NÃO recebe o contexto local do financeiro
  recentes,
});
costurado.push(pergunta);

// O papel "tool" sem tool_call_id é recusado por APIs estritas; aqui convertemos para texto do assistente.
const semToolRole = (msgs) => msgs.map((m) => (m.role === 'tool' ? { role: 'assistant', content: `[resultado de ferramenta] ${m.content}` } : m));

for (const [nome, msgs] of [['A · só janela', ingenuo], ['B · podado + resumo + stitching', costurado]]) {
  const { msg, usage, ms } = await chat(semToolRole(msgs), { maxTokens: 60 });
  console.log(`\n[${nome}] ~${estimarTokens(msgs)} tokens estimados / ${usage.prompt_tokens} reais, ${(ms / 1000).toFixed(0)}s`);
  console.log(`  resposta: ${msg.content.trim()}`);
}
console.log(`\n${resumoUso()}`);
