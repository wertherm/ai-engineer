// Approval Gate: função PURA que decide o destino de uma ação proposta pelo agente.
// Policy-Driven Control: as regras vêm de politica.json (versionada), não estão espalhadas no código.
// Ordem importa: proibição > ação sensível > valor > confiança. A confiança sozinha nunca libera tudo.
export function avaliar(acao, politica) {
  if (politica.acoesProibidas.includes(acao.tipo)) return { decisao: 'bloqueada', motivo: 'ação proibida pela política' };
  if (politica.acoesSempreHumano.includes(acao.tipo)) return { decisao: 'pendente', motivo: 'ação sensível exige humano' };
  if ((acao.valor ?? 0) > politica.valorMaxAutomatico) return { decisao: 'pendente', motivo: `valor acima de ${politica.valorMaxAutomatico}` };
  if (acao.confianca < politica.limiarConfianca) return { decisao: 'pendente', motivo: `confiança ${acao.confianca} < ${politica.limiarConfianca}` };
  return { decisao: 'automatica', motivo: 'dentro da política' };
}
