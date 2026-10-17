// Prompt templates: o prompt vira um artefato versionado, com variáveis declaradas.
// Benefícios: reuso (o mesmo template em vários pontos), revisão em PR, A/B por versão
// e falha rápida quando falta uma variável (em vez de mandar "{{pedido}}" para o modelo).

export function renderizar(template, variaveis) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, nome) => {
    if (!(nome in variaveis)) throw new Error(`Variável ausente no template: ${nome}`);
    return String(variaveis[nome]);
  });
}

// Cada template tem id + versão: logue os dois junto com a resposta para saber
// qual prompt gerou qual saída quando algo der errado em produção.
export const TEMPLATES = {
  extrair: {
    id: "extrair-reclamacao",
    versao: 3,
    system:
      "Você extrai dados de reclamações de clientes. Use SOMENTE o que está no texto. " +
      "Se um campo não aparece no texto, use null. Não invente números de pedido.",
    user: "Texto do cliente:\n<<<\n{{texto}}\n>>>",
  },
  classificar: {
    id: "classificar-urgencia",
    versao: 3,
    system: "Classifique a urgência de um chamado de suporte: alta (dinheiro ou prazo em risco), media ou baixa. Justificativa em até 15 palavras.",
    user: "Produto: {{produto}}\nProblema: {{problema}}\nPrazo do cliente: {{prazo}}",
  },
  responder: {
    id: "responder-cliente",
    versao: 1,
    system: "Você é do suporte da loja. Responda em português, em no máximo 2 frases, sem prometer prazos.",
    user: "Problema: {{problema}}\nPedido: {{pedido}}\nUrgência: {{urgencia}}\nEscreva a resposta ao cliente.",
  },
};

export function mensagens(t, variaveis) {
  return [
    { role: "system", content: t.system },
    { role: "user", content: renderizar(t.user, variaveis) },
  ];
}
