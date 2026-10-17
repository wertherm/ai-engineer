// Regras determinísticas do bot: o que precisa de aprovação e quais lembretes disparar.
// O LLM nunca decide se algo está aprovado.

export function precisaAprovacao(op) {
  if (op.acao === 'arquivar') return 'arquivar card é irreversível para o time';
  // Prioridade só vale para criar/priorizar; num 'mover' o campo é ignorado (o LLM às vezes preenche à toa).
  if (['criar', 'priorizar'].includes(op.acao) && op.prioridade === 'alta') return 'prioridade alta fura a fila da sprint';
  return null;
}

// Lembretes: card com prazo nas próximas 48h e sem responsável, ou já vencido e fora de "Feito".
export function lembretes(cards, listas, agora) {
  const feito = listas.find((l) => l.name === 'Feito')?.id;
  const avisos = [];
  for (const c of cards) {
    if (!c.due || c.idList === feito) continue;
    const horas = (new Date(c.due) - agora) / 36e5;
    if (horas < 0) avisos.push(`🔴 "${c.name}" venceu há ${Math.round(-horas)}h`);
    else if (horas <= 48 && c.idMembers.length === 0) avisos.push(`🟡 "${c.name}" vence em ${Math.round(horas)}h e está sem responsável`);
  }
  return avisos;
}

// Payload no formato do Slack (Block Kit). Aqui só é impresso; ver integracoes-reais.js para enviar.
export const mensagemSlack = (canal, avisos) => ({
  channel: canal,
  text: `${avisos.length} lembrete(s) do board`,
  blocks: [{ type: 'section', text: { type: 'mrkdwn', text: avisos.join('\n') } }],
});
