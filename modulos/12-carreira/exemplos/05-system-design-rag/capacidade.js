// Estimativas "de guardanapo" para system design de IA: volume, pico, concorrência, tokens, custo e
// armazenamento vetorial. Funções puras: o exemplo 05 e o exercício 02 reaproveitam.

// PREÇOS ILUSTRATIVOS em US$ por 1 milhão de tokens (os mesmos do exemplo 02 do módulo 02). NÃO são de um
// provedor específico: troque pelos da página de preços do provedor escolhido, com a data da consulta.
export const PRECOS_ILUSTRATIVOS = { entrada: 0.4, entradaEmCache: 0.1, saida: 1.6, embedding: 0.02 };

/**
 * @param {object} p
 * @param {number} p.usuarios               base total de usuários
 * @param {number} p.ativosDia              fração que usa num dia útil (0–1)
 * @param {number} p.requisicoesPorAtivo    requisições por usuário ativo por dia
 * @param {number} p.chamadasLLM            chamadas ao LLM por requisição (RAG simples = 1; agente = várias)
 * @param {number} p.tokensEntrada          tokens de entrada por chamada (sistema + contexto + histórico + pergunta)
 * @param {number} p.tokensSaida            tokens de saída por chamada
 * @param {number} p.fracaoCacheada         fração dos tokens de entrada servida do cache de prompt (0–1)
 * @param {number} p.horasUteis             janela em que o uso acontece
 * @param {number} p.fatorPico              pico / média dentro da janela
 * @param {number} p.latenciaS              latência média ponta a ponta de uma requisição (s)
 * @param {number} p.diasMes                dias de uso por mês
 */
export function estimar(p, precos = PRECOS_ILUSTRATIVOS) {
  const reqDia = p.usuarios * p.ativosDia * p.requisicoesPorAtivo;
  const rpsMedio = reqDia / (p.horasUteis * 3600);
  const rpsPico = rpsMedio * p.fatorPico;
  // Lei de Little: requisições simultâneas = taxa de chegada × tempo no sistema.
  const concorrenciaPico = rpsPico * p.latenciaS;
  const chamadasMes = reqDia * p.chamadasLLM * p.diasMes;
  const entradaMes = chamadasMes * p.tokensEntrada;
  const saidaMes = chamadasMes * p.tokensSaida;
  const custoMes =
    ((entradaMes * (1 - p.fracaoCacheada)) / 1e6) * precos.entrada +
    ((entradaMes * p.fracaoCacheada) / 1e6) * precos.entradaEmCache +
    (saidaMes / 1e6) * precos.saida;
  return {
    reqDia,
    rpsMedio,
    rpsPico,
    concorrenciaPico,
    // Throughput de geração que o servidor de inferência precisa sustentar no pico (decisivo para self-host).
    tokensSaidaPorSegundoPico: rpsPico * p.chamadasLLM * p.tokensSaida,
    tokensMes: { entrada: entradaMes, saida: saidaMes },
    custoMes,
    custoPorRequisicao: custoMes / (reqDia * p.diasMes),
  };
}

/** Armazenamento do índice vetorial: vetores float32 + texto dos trechos (sem contar o overhead do índice). */
export function armazenamento({ documentos, trechosPorDoc, dimensoes, bytesTextoPorTrecho }) {
  const trechos = documentos * trechosPorDoc;
  const bytesVetores = trechos * dimensoes * 4; // float32 = 4 bytes por dimensão
  return { trechos, gbVetores: bytesVetores / 1e9, gbTexto: (trechos * bytesTextoPorTrecho) / 1e9 };
}

/** Custo de (re)indexar a base inteira com embeddings via API. */
export function custoIndexacao({ trechos, tokensPorTrecho }, precos = PRECOS_ILUSTRATIVOS) {
  return ((trechos * tokensPorTrecho) / 1e6) * precos.embedding;
}
