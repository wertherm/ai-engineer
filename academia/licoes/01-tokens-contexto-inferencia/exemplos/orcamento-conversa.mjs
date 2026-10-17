// Exemplo 2 · Por que uma conversa longa fica cara: a API não tem memória, então cada turno reenvia o histórico.
// Roda offline (nenhum LLM é chamado). Altere os números e observe.
//
//   node academia/licoes/01-tokens-contexto-inferencia/exemplos/orcamento-conversa.mjs [turnos] [tokens_pergunta] [tokens_resposta]

const turnos = Number(process.argv[2] ?? 10);
const pergunta = Number(process.argv[3] ?? 100);
const resposta = Number(process.argv[4] ?? 200);
const janela = 8_000; // exemplo didático; modelos reais variam muito (veja a documentação do modelo)

let historico = 0; // tokens já acumulados na conversa
let entradaTotal = 0; // soma dos tokens de entrada enviados em todas as chamadas
let saidaTotal = 0;

console.log('turno | entrada enviada | saída | contexto ao fim | cabe na janela?');
for (let t = 1; t <= turnos; t++) {
  const entrada = historico + pergunta; // histórico inteiro + a pergunta nova
  const contextoFinal = entrada + resposta;
  entradaTotal += entrada;
  saidaTotal += resposta;
  console.log(
    `${String(t).padStart(5)} | ${String(entrada).padStart(15)} | ${String(resposta).padStart(5)} | ` +
      `${String(contextoFinal).padStart(15)} | ${contextoFinal <= janela ? 'sim' : 'NÃO'}`,
  );
  historico = contextoFinal; // a resposta também volta no próximo turno
}

const util = turnos * (pergunta + resposta);
console.log('');
console.log(`conteúdo novo (perguntas + respostas): ${util} tokens`);
console.log(`tokens de entrada realmente enviados : ${entradaTotal} (${(entradaTotal / util).toFixed(1)}x o conteúdo novo)`);
console.log(`tokens de saída gerados              : ${saidaTotal}`);
console.log('A entrada acumulada cresce com o quadrado do número de turnos; a saída, linearmente.');
