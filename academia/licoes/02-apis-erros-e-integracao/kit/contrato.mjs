// Contrato do laboratório da Lição 2: o que o seu programa `chamar.*` recebe, o que ele imprime e como os erros se chamam.
// O verificador (../verificar.mjs) e o servidor falso (./servidor-falso.mjs) usam estes valores. Leia, não altere.
//
// Como o seu programa é chamado (em qualquer linguagem):
//     <executor> chamar.<ext> "<prompt>"
//   com estas variáveis de ambiente (as três primeiras são sempre definidas; as outras têm o padrão da tabela PADROES):
//     OPENAI_BASE_URL   termina em /v1 (o programa acrescenta /chat/completions)
//     OPENAI_API_KEY    vai no cabeçalho Authorization: Bearer <chave> e NUNCA aparece na saída
//     MODELO_CHAT       nome do modelo
//
// O que ele imprime: UMA linha JSON no stdout, em UTF-8 (prefira o JSON com escapes ASCII, como o padrão de json.dumps; logs vão para o stderr) e termina com código 0 se deu certo, 1 se falhou
// (2 para erro de configuração ou de uso, sem JSON). Formato:
//     sucesso: {"ok":true,"texto":"...","finish_reason":"stop","usage":{"prompt_tokens":..,"completion_tokens":..,"total_tokens":..},"tentativas":N}
//     falha  : {"ok":false,"erro":{"tipo":"<um de TIPOS_DE_ERRO>","repetivel":true|false,"status":<número ou null>,"mensagem":"..."},"tentativas":N}

export const PROMPT = 'Diga olá em uma palavra.';

/** Os nove tipos de falha, com o que significam e se vale tentar de novo. */
export const TIPOS_DE_ERRO = {
  rede: { repetivel: true, quando: 'conexão recusada, derrubada ou sem rota (nenhuma resposta HTTP chegou)' },
  timeout: { repetivel: true, quando: 'estourou TIMEOUT_MS sem resposta completa' },
  limite_de_taxa: { repetivel: true, quando: 'HTTP 429 de limite de taxa (pedir mais devagar resolve)' },
  servidor: { repetivel: true, quando: 'HTTP 5xx (e 408): falha ou sobrecarga do lado do provedor' },
  cota_esgotada: { repetivel: false, quando: 'HTTP 429 de cota, crédito ou limite de gasto (esperar não resolve)' },
  autenticacao: { repetivel: false, quando: 'HTTP 401 ou 403' },
  requisicao_invalida: { repetivel: false, quando: 'qualquer outro 4xx (400, 404, 413, 422...)' },
  truncado: { repetivel: false, quando: 'HTTP 200 com finish_reason "length": a resposta foi cortada' },
  resposta_invalida: { repetivel: false, quando: 'HTTP 200 cujo corpo não é o JSON de chat esperado' },
};
export const NOMES_DOS_TIPOS = Object.keys(TIPOS_DE_ERRO);
export const REPETIVEIS = NOMES_DOS_TIPOS.filter((t) => TIPOS_DE_ERRO[t].repetivel);

/** Variáveis opcionais e o valor que o seu programa deve assumir quando elas não existem. */
export const PADROES = {
  'PARAM_MAX_TOKENS': 'max_tokens', // nome do campo do teto de saída no corpo ("max_completion_tokens" em alguns provedores)
  TEMPERATURA: '0', // número, ou "omitir" para não enviar o campo
  MAX_TOKENS: '64',
  TIMEOUT_MS: '30000', // tempo máximo de CADA tentativa (da conexão ao fim do corpo da resposta)
  MAX_TENTATIVAS: '3', // total de tentativas, contando a primeira
  BACKOFF_BASE_MS: '500', // espera antes da 2ª tentativa; dobra a cada falha, até BACKOFF_TETO_MS
  BACKOFF_TETO_MS: '8000',
  ESPERA_MAX_MS: '60000', // se o Retry-After pedir mais que isto, desista em vez de esperar
};
