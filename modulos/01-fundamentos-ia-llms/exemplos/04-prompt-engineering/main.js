// Exemplo 04 — Prompt engineering MEDIDO: a mesma tarefa com 3 prompts, comparando saídas reais.
// Tarefa: triagem de tickets de suporte -> {"tipo": "bug"|"feature"|"duvida", "urgente": true|false}
import { chat } from '../../lib/llm.js';

// "Gabarito" escrito por um humano: sem isso não existe medir, só achar.
const tickets = [
  { texto: 'Depois da atualização o app fecha sozinho quando clico em pagar. Perdi 3 vendas hoje!', tipo: 'bug', urgente: true },
  { texto: 'Seria ótimo exportar o relatório mensal em PDF.', tipo: 'feature', urgente: false },
  { texto: 'Como faço para trocar o e-mail da minha conta?', tipo: 'duvida', urgente: false },
  { texto: 'O botão de salvar perfil não responde no Firefox.', tipo: 'bug', urgente: false },
];

const prompts = {
  // A) Vago: sem papel, sem formato, sem critérios. O modelo "conversa" em vez de classificar.
  'A-vago': (t) => [{ role: 'user', content: `O que você acha deste ticket? ${t}` }],

  // B) Instrução clara: papel + rótulos permitidos + critério de urgência + formato de saída.
  'B-instrucao': (t) => [
    {
      role: 'system',
      content:
        'Você faz triagem de tickets de suporte. Responda APENAS um JSON numa linha: ' +
        '{"tipo":"bug"|"feature"|"duvida","urgente":true|false}. ' +
        'urgente=true só se houver perda de dinheiro, dados ou bloqueio total.',
    },
    { role: 'user', content: t },
  ],

  // C) Few-shot: mesma instrução + 2 exemplos resolvidos (o modelo imita o padrão).
  'C-few-shot': (t) => [
    ...prompts['B-instrucao']('').slice(0, 1),
    { role: 'user', content: 'Não consigo logar, dá erro 500 e a loja inteira está parada.' },
    { role: 'assistant', content: '{"tipo":"bug","urgente":true}' },
    { role: 'user', content: 'Vocês têm integração com o Slack?' },
    { role: 'assistant', content: '{"tipo":"duvida","urgente":false}' },
    { role: 'user', content: t },
  ],
};

// Tenta extrair o JSON da resposta (modelos às vezes embrulham em ```json ... ```).
function parse(texto) {
  const m = texto.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

const resumo = [];
for (const [nome, montar] of Object.entries(prompts)) {
  let validos = 0, acertos = 0, tokPrompt = 0, tokSaida = 0, ms = 0;
  console.log(`\n=== Prompt ${nome} ===`);
  for (const tk of tickets) {
    const r = await chat(montar(tk.texto), { maxTokens: 40 });
    const j = parse(r.texto);
    const ok = j && j.tipo === tk.tipo && j.urgente === tk.urgente;
    if (j) validos++;
    if (ok) acertos++;
    tokPrompt += r.usage.prompt_tokens;
    tokSaida += r.usage.completion_tokens;
    ms += r.ms;
    const saida = r.texto.replace(/\s+/g, ' ').slice(0, 90);
    console.log(`${ok ? 'OK ' : 'ERR'} esperado=${tk.tipo}/${tk.urgente} | saída: ${saida}${r.finishReason === 'length' ? ' [cortado]' : ''}`);
  }
  resumo.push({ prompt: nome, 'JSON válido': `${validos}/${tickets.length}`, acertos: `${acertos}/${tickets.length}`, 'tokens entrada': tokPrompt, 'tokens saída': tokSaida, 'tempo (s)': (ms / 1000).toFixed(1) });
}
console.log('\n=== Resumo ===');
console.table(resumo);
