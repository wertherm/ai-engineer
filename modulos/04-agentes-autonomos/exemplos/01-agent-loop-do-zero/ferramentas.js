// Toolbox: cada ferramenta = schema JSON (o que o modelo vê) + handler (o que o código executa).
// O modelo NUNCA executa nada: ele só devolve um pedido { name, arguments } e o nosso código decide.

const estoque = { teclado: 40, mouse: 7, monitor: 3 };

// Avaliador aritmético seguro: só aceita dígitos, espaços, ponto e + - * / ( ).
// Nada de eval() com texto vindo do modelo.
function calcularSeguro(expressao) {
  if (!/^[\d\s.+\-*/()]+$/.test(expressao)) throw new Error('expressão com caracteres não permitidos');
  return Function(`"use strict"; return (${expressao});`)();
}

export const ferramentas = {
  consultar_estoque: {
    schema: {
      type: 'function',
      function: {
        name: 'consultar_estoque',
        description: 'Retorna a quantidade em estoque de um produto.',
        parameters: {
          type: 'object',
          properties: {
            produto: { type: 'string', enum: Object.keys(estoque), description: 'Nome do produto, no singular' },
          },
          required: ['produto'],
          additionalProperties: false,
        },
      },
    },
    handler: ({ produto }) => ({ produto, quantidade: estoque[produto] }),
  },
  calcular: {
    schema: {
      type: 'function',
      function: {
        name: 'calcular',
        description: 'Avalia uma expressão aritmética (ex.: "40 - 3*12").',
        parameters: {
          type: 'object',
          properties: { expressao: { type: 'string' } },
          required: ['expressao'],
          additionalProperties: false,
        },
      },
    },
    handler: ({ expressao }) => ({ expressao, resultado: calcularSeguro(expressao) }),
  },
};

/** Validação mínima contra o schema: campos obrigatórios, tipos simples e enum. */
export function validarArgs(schema, args) {
  const { properties = {}, required = [] } = schema.function.parameters;
  for (const campo of required) if (!(campo in args)) return `campo obrigatório ausente: ${campo}`;
  for (const [campo, valor] of Object.entries(args)) {
    const regra = properties[campo];
    if (!regra) return `campo desconhecido: ${campo}`;
    if (regra.type === 'string' && typeof valor !== 'string') return `${campo} deve ser string`;
    if (regra.enum && !regra.enum.includes(valor)) return `${campo} deve ser um de: ${regra.enum.join(', ')}`;
  }
  return null;
}
