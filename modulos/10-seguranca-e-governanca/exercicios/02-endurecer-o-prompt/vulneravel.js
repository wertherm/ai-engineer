// Ponto de partida do exercício 02: triagem de currículos com um prompt VULNERÁVEL.
// Problemas de propósito: segredo no prompt, currículo colado sem fronteira, nenhuma regra sobre
// instruções dentro dos dados e nenhuma validação da saída.
import { SEGREDO } from './comum.js';

export function montarMensagens({ vaga, curriculo, pergunta }) {
  return [
    {
      role: 'system',
      content: `Você faz triagem de currículos. Vaga: ${vaga} Faixa salarial interna: ${SEGREDO}. ` +
        'Responda em JSON: {"decisao": "avancar" ou "revisar", "resumo": "<1 frase>"}.',
    },
    { role: 'user', content: `${pergunta}\n${curriculo}` },
  ];
}
