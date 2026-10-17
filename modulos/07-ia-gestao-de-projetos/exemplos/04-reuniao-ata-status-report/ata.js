// Reunião -> ata estruturada. O LLM extrai; o código valida responsáveis/datas e gera o .ics.
import { z } from 'zod';

// O schema é montado pelo CÓDIGO a partir da reunião: responsável e prazo viram enums.
// Assim o decoding restrito do servidor só deixa o LLM escolher um participante real e uma data válida.
export function criarSchemaAta(nomes, datas) {
  return z.object({
    decisoes: z.array(z.string()),
    pendencias: z.array(z.string()).describe('dúvidas ou bloqueios ainda sem resposta'),
    acoes: z.array(z.object({
      responsavel: z.enum(nomes),
      tarefa: z.string(),
      prazo: z.enum([...datas, 'sem prazo']),
    })),
  });
}

// Próximos N dias corridos a partir da reunião, com o dia da semana para o LLM resolver "quarta, dia 4".
export function calendario(inicioIso, dias = 14) {
  const nomesDia = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(`${inicioIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { iso: d.toISOString().slice(0, 10), dia: nomesDia[d.getUTCDay()] };
  });
}

// Participantes vêm da própria transcrição (código), não do LLM.
export function participantes(transcricao) {
  return [...new Set([...transcricao.matchAll(/^\[[\d:]+\] (\p{L}+)/gmu)].map((m) => m[1]))];
}

// Segunda linha de defesa: se trocar para um provedor sem decoding restrito, o enum pode não ser respeitado.
export function validarAta(ata, nomes) {
  const problemas = [];
  for (const a of ata.acoes) {
    if (!nomes.includes(a.responsavel)) problemas.push(`responsável "${a.responsavel}" não estava na reunião`);
    if (a.prazo !== 'sem prazo' && !/^\d{4}-\d{2}-\d{2}$/.test(a.prazo)) problemas.push(`prazo inválido: ${a.prazo}`);
  }
  if (ata.acoes.length === 0) problemas.push('reunião sem nenhuma ação: confira a extração');
  return problemas;
}

// Integração com calendário: um VTODO por ação (RFC 5545). Importável no Google Calendar/Outlook/Thunderbird.
export function gerarIcs(acoes, agora = new Date()) {
  const stamp = agora.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const todos = acoes.filter((a) => a.prazo !== 'sem prazo').map((a, i) => [
    'BEGIN:VTODO',
    `UID:acao-${i + 1}-${stamp}@modulo07`,
    `DTSTAMP:${stamp}`,
    `DUE;VALUE=DATE:${a.prazo.replaceAll('-', '')}`,
    `SUMMARY:${a.tarefa.replace(/[,;]/g, ' ')}`,
    `DESCRIPTION:Responsável: ${a.responsavel}`,
    'END:VTODO',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//modulo07//ata//PT', ...todos, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
