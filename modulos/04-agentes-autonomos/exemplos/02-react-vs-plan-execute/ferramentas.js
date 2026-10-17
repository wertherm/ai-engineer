// Ferramentas compartilhadas pelas três estratégias. Cada uma devolve { valor: number }
// para que o plano (Plan-and-Execute) possa referenciar resultados anteriores (#E1, #E2...).
const estoque = { teclado: 40, mouse: 7, monitor: 3 };
const preco = { teclado: 120, mouse: 50, monitor: 900 };

function calcularSeguro(expressao) {
  if (!/^[\d\s.+\-*/()]+$/.test(expressao)) throw new Error(`expressão inválida: ${expressao}`);
  return Function(`"use strict"; return (${expressao});`)();
}

const produtoParam = {
  type: 'object',
  properties: { produto: { type: 'string', enum: Object.keys(estoque) } },
  required: ['produto'],
  additionalProperties: false,
};

export const ferramentas = {
  consultar_estoque: {
    description: 'Quantidade em estoque de um produto.',
    parameters: produtoParam,
    handler: ({ produto }) => ({ valor: estoque[produto] }),
  },
  consultar_preco: {
    description: 'Preço unitário de compra (R$) de um produto.',
    parameters: produtoParam,
    handler: ({ produto }) => ({ valor: preco[produto] }),
  },
  calcular: {
    description: 'Avalia uma expressão aritmética, ex.: "(10-7)*50".',
    parameters: {
      type: 'object',
      properties: { expressao: { type: 'string' } },
      required: ['expressao'],
      additionalProperties: false,
    },
    handler: ({ expressao }) => ({ valor: calcularSeguro(expressao) }),
  },
};

export const schemasOpenAI = Object.entries(ferramentas).map(([name, f]) => ({
  type: 'function',
  function: { name, description: f.description, parameters: f.parameters },
}));

export function executarFerramenta(nome, args) {
  const f = ferramentas[nome];
  if (!f) return { erro: `ferramenta inexistente: ${nome}` };
  try { return f.handler(args); } catch (e) { return { erro: e.message }; }
}

export const TAREFA = 'Quanto custa (R$) comprar só o que falta para mouse e monitor chegarem a 10 unidades em estoque cada?';
export const RESPOSTA_CERTA = (10 - 7) * 50 + (10 - 3) * 900; // 6450
