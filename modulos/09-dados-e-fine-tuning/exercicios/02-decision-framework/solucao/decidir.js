// Solução do exercício 02: decision framework (prompt × RAG × fine-tuning × modelo maior) aplicado a 3 casos.
// Regras explícitas (auditáveis) + custo mensal estimado de cada opção com os preços de 2026-10-16.
// Uso (da pasta do módulo): node exercicios/02-decision-framework/solucao/decidir.js

// US$ por 1M tokens (https://developers.openai.com/api/docs/pricing). "ft" = modelo fine-tunado (input/output).
const P = {
  pequeno: { in: 0.1, out: 0.4 },        // gpt-4.1-nano
  pequenoFt: { in: 0.2, out: 0.8, treino: 1.5 },
  maior: { in: 2.0, out: 8.0 },          // gpt-4.1
  embed: 0.02,                           // embeddings para indexar o RAG (ordem de grandeza)
};

const casos = [
  {
    nome: 'Jurídico: responder dúvidas sobre 3.000 contratos que mudam toda semana',
    conhecimentoMuda: true, precisaCitarFonte: true, formatoRigido: false, tarefaEstreita: false,
    exemplosRotulados: 0, chamadasMes: 20_000, tokensEntrada: 400, tokensSaida: 300, raciocinioComplexo: false,
  },
  {
    nome: 'Suporte: classificar 300 mil tickets/mês em 5 categorias, com latência baixa',
    conhecimentoMuda: false, precisaCitarFonte: false, formatoRigido: true, tarefaEstreita: true,
    exemplosRotulados: 5_000, chamadasMes: 300_000, tokensEntrada: 80, tokensSaida: 3, raciocinioComplexo: false,
  },
  {
    nome: 'Financeiro: parecer de crédito com análise de 10 indicadores, 500 casos/mês',
    conhecimentoMuda: false, precisaCitarFonte: false, formatoRigido: false, tarefaEstreita: false,
    exemplosRotulados: 40, chamadasMes: 500, tokensEntrada: 3_000, tokensSaida: 800, raciocinioComplexo: true,
  },
];

const custo = (p, c, extraEntrada = 0) => (c.chamadasMes * ((c.tokensEntrada + extraEntrada) * p.in + c.tokensSaida * p.out)) / 1e6;

function decidir(c) {
  const opcoes = {
    'prompt (modelo pequeno + few-shot)': custo(P.pequeno, c, 600),
    'RAG (modelo pequeno + 2k tokens de contexto)': custo(P.pequeno, c, 2_000) + (c.conhecimentoMuda ? 5 : 0),
    'fine-tuning (pequeno ajustado)': custo(P.pequenoFt, c) + (c.exemplosRotulados * 150 * 3 * P.pequenoFt.treino) / 1e6,
    'modelo maior (sem ajuste)': custo(P.maior, c, 600),
  };
  // As regras seguem a ordem do doc 01: comece barato e só suba de degrau com motivo.
  let escolha, motivo;
  if (c.conhecimentoMuda || c.precisaCitarFonte) {
    escolha = 'RAG (modelo pequeno + 2k tokens de contexto)';
    motivo = 'conhecimento muda e precisa de fonte: pesos congelam o conhecimento, o RAG atualiza no índice';
  } else if (c.tarefaEstreita && c.formatoRigido && c.exemplosRotulados >= 100 && c.chamadasMes >= 50_000) {
    escolha = 'fine-tuning (pequeno ajustado)';
    motivo = 'tarefa estreita, formato rígido, muitos exemplos e alto volume: o prompt encurta e o modelo pequeno basta';
  } else if (c.raciocinioComplexo && c.chamadasMes < 10_000) {
    escolha = 'modelo maior (sem ajuste)';
    motivo = 'raciocínio complexo com volume baixo e poucos exemplos: pagar mais por chamada sai mais barato que montar dataset';
  } else {
    escolha = 'prompt (modelo pequeno + few-shot)';
    motivo = 'nenhum sinal forte: comece pelo prompt e meça antes de investir';
  }
  return { escolha, motivo, opcoes };
}

for (const c of casos) {
  const { escolha, motivo, opcoes } = decidir(c);
  console.log(`\n${c.nome}\n  -> ${escolha}\n     porquê: ${motivo}`);
  for (const [o, v] of Object.entries(opcoes)) console.log(`     ${o === escolha ? '*' : ' '} ${o.padEnd(46)} US$ ${v.toFixed(2)}/mês`);
}
console.log('\n(* = escolhida; custo não é o único critério: dados disponíveis, manutenção e risco pesam)');
