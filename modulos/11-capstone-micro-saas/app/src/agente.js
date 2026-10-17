// Agente principal: usa o RAG como FERRAMENTA para perguntas complexas (que pedem mais de uma busca,
// comparação entre políticas ou conta). Agent loop do módulo 04 (exemplos/01-agent-loop-do-zero):
// percepção -> raciocínio (LLM decide) -> ação (tool) -> feedback, com limite de passos.

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_politicas',
      description: 'Busca trechos das políticas internas da empresa. Faça uma busca por assunto (ex.: "férias", "reembolso de alimentação").',
      parameters: {
        type: 'object',
        properties: { consulta: { type: 'string', description: 'assunto a buscar, curto' } },
        required: ['consulta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_documentos',
      description: 'Lista os documentos de política disponíveis da empresa.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

/**
 * @param servico fachada do Micro-SaaS (servico.js): o agente só enxerga o tenant recebido.
 * @returns { resposta, passos, fontes, chamadas, verificado }
 */
export async function executarAgente({ servico, llm, tenant, pergunta, maxPassos = 4, log = () => {} }) {
  const memoria = [
    {
      role: 'system',
      content:
        `Você é o agente de políticas internas da empresa ${tenant.nome}. Use buscar_politicas (uma busca por assunto) ` +
        'antes de responder; nunca invente regras. Na resposta final, cite o arquivo de cada regra entre colchetes, ' +
        'ex.: [ferias.md]. Responda em português, em no máximo 4 frases.',
    },
    { role: 'user', content: pergunta },
  ];
  const fontesVistas = new Set();
  const chamadas = [];

  for (let passo = 1; passo <= maxPassos; passo++) {
    // No último passo tiramos as tools: força o modelo a responder com o que já coletou.
    const tools = passo < maxPassos ? TOOLS : undefined;
    const { msg, ms } = await llm.chat(memoria, { tools, maxTokens: 200 });
    memoria.push(msg);
    log(`[passo ${passo}] ${(ms / 1000).toFixed(1)}s ${msg.tool_calls?.length ? `-> ${msg.tool_calls.map((c) => `${c.function.name}(${c.function.arguments})`).join(', ')}` : '-> resposta final'}`);

    if (!msg.tool_calls?.length) {
      const citadas = [...(msg.content ?? '').matchAll(/\[([\w.-]+\.md)\]/g)].map((m) => m[1]);
      // Guarda: só vale citação de arquivo que o agente realmente leu nesta execução.
      const verificado = citadas.length > 0 && citadas.every((f) => fontesVistas.has(f));
      return { resposta: msg.content, passos: passo, fontes: [...fontesVistas], chamadas, verificado };
    }

    for (const call of msg.tool_calls) {
      let resultado;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        if (call.function.name === 'buscar_politicas') {
          const trechos = await servico.buscar(tenant, String(args.consulta ?? pergunta), { k: 3, canal: 'agente' });
          trechos.forEach((t) => fontesVistas.add(t.fonte));
          resultado = trechos.map((t) => ({ arquivo: t.fonte, trecho: t.conteudo }));
        } else if (call.function.name === 'listar_documentos') {
          resultado = await servico.listarDocumentos(tenant);
        } else {
          resultado = { erro: `ferramenta inexistente: ${call.function.name}` };
        }
      } catch (e) {
        resultado = { erro: e.message }; // o erro volta ao modelo como feedback, não derruba o loop
      }
      chamadas.push(call.function.name);
      memoria.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(resultado) });
    }
  }
  return { resposta: null, passos: maxPassos, fontes: [...fontesVistas], chamadas, verificado: false };
}
