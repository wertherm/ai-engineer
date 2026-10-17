// Exemplo 01 · Decision framework executável: regra determinística × LLM × híbrido.
// A pergunta de arquitetura não é "IA ou não?", e sim "qual rota bate o SLA de acerto, latência e custo
// para ESTE conjunto de casos?". Aqui medimos as três rotas no mesmo conjunto e deixamos os números decidirem.
import { chat, custoUSD, tabela } from '../../comum/llm.js';

const ROTULOS = ['saldo', 'cartao', 'pix', 'reclamacao', 'outro'];

// Conjunto de avaliação com gabarito. Metade é "fácil" (palavra-chave óbvia), metade exige entender a frase.
const CASOS = [
  { texto: 'Qual o saldo da minha conta?', esperado: 'saldo' },
  { texto: 'Quero bloquear meu cartão', esperado: 'cartao' },
  { texto: 'Como faço um pix para minha mãe?', esperado: 'pix' },
  { texto: 'Estou muito insatisfeito com o atendimento de ontem', esperado: 'reclamacao' },
  { texto: 'Perdi a carteira com tudo dentro, e agora?', esperado: 'cartao' },
  { texto: 'Mandei dinheiro pela chave do celular e não caiu', esperado: 'pix' },
  { texto: 'Quanto ainda tenho disponível pra gastar este mês?', esperado: 'saldo' },
  { texto: 'Vocês abrem no feriado?', esperado: 'outro' },
];

// Rota 1 · regras: rápidas, grátis, auditáveis, mas só entendem o que alguém previu.
const REGRAS = {
  saldo: /\bsaldo\b|\bextrato\b/i,
  cartao: /\bcart[aã]o\b|\bfatura\b/i,
  pix: /\bpix\b/i,
  reclamacao: /insatisfeit|reclama|p[eé]ssimo/i,
};
function rotaRegra(texto) {
  const hits = Object.entries(REGRAS).filter(([, re]) => re.test(texto)).map(([r]) => r);
  // Só responde quando tem certeza (exatamente 1 regra casou). Senão admite que não sabe.
  return hits.length === 1 ? hits[0] : null;
}

// Rota 2 · LLM: entende paráfrase, mas custa tokens, latência e pode errar sem avisar.
const SISTEMA = `Classifique o pedido de um cliente de banco em UMA palavra entre: ${ROTULOS.join(', ')}.
Perda/roubo de cartão ou carteira = cartao. Transferência por chave = pix. Responda só a palavra.`;
async function rotaLLM(texto) {
  const r = await chat(
    [
      { role: 'system', content: SISTEMA },
      { role: 'user', content: texto },
    ],
    { maxTokens: 4 },
  );
  const palavra = r.texto.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  // Saída fora do contrato vira "outro": nunca confie que o modelo respeitou a lista.
  return { rotulo: ROTULOS.includes(palavra) ? palavra : 'outro', ms: r.ms, usd: custoUSD('barato', r.usage) };
}

const resultados = [];
for (const caso of CASOS) {
  const t0 = performance.now();
  const regra = rotaRegra(caso.texto);
  const msRegra = performance.now() - t0;
  const llm = await rotaLLM(caso.texto);
  // Rota 3 · híbrida: regra primeiro; LLM só quando a regra não sabe (aqui reaproveitamos a medição).
  const hibrido = regra ? { rotulo: regra, ms: msRegra, usd: 0 } : llm;
  resultados.push({ caso, regra: { rotulo: regra ?? 'nao_sei', ms: msRegra, usd: 0 }, llm, hibrido });
  console.log(`- "${caso.texto}" → regra=${regra ?? 'nao_sei'} llm=${llm.rotulo} (${llm.ms} ms) gabarito=${caso.esperado}`);
}

function resumo(nome, chave) {
  const n = resultados.length;
  const acertos = resultados.filter((r) => r[chave].rotulo === r.caso.esperado).length;
  const cobertura = resultados.filter((r) => r[chave].rotulo !== 'nao_sei').length;
  const ms = resultados.reduce((s, r) => s + r[chave].ms, 0) / n;
  const usd = resultados.reduce((s, r) => s + r[chave].usd, 0);
  return { rota: nome, acerto: acertos / n, cobertura: cobertura / n, latenciaMediaMs: ms, usdPor1kPedidos: (usd / n) * 1000 };
}
const linhas = [resumo('regra', 'regra'), resumo('llm', 'llm'), resumo('hibrida', 'hibrido')];

console.log('\n' + tabela(linhas.map((l) => ({
  rota: l.rota,
  acerto: `${(l.acerto * 100).toFixed(0)}%`,
  cobertura: `${(l.cobertura * 100).toFixed(0)}%`,
  'latência média': `${l.latenciaMediaMs.toFixed(1)} ms`,
  'US$/1k pedidos': l.usdPor1kPedidos.toFixed(4),
}))));

// O "decision framework" vira código: SLA declarado → filtra rotas que cumprem → escolhe a mais barata.
// Latência default generosa porque o modelo roda em CPU (~5 tokens/s); numa API real use ~1500 ms.
const SLA = { acertoMin: 0.85, latenciaMaxMs: Number(process.env.SLA_MS ?? 60000), usdMaxPor1k: 0.05 };
const aprovadas = linhas.filter((l) => l.acerto >= SLA.acertoMin && l.latenciaMediaMs <= SLA.latenciaMaxMs && l.usdPor1kPedidos <= SLA.usdMaxPor1k);
console.log(`\nSLA: acerto >= ${SLA.acertoMin * 100}%, latência <= ${SLA.latenciaMaxMs} ms, custo <= US$ ${SLA.usdMaxPor1k}/1k`);
if (aprovadas.length === 0) {
  console.log('Nenhuma rota cumpre o SLA: revise o SLA, as regras ou o modelo.');
} else {
  aprovadas.sort((a, b) => a.usdPor1kPedidos - b.usdPor1kPedidos || a.latenciaMediaMs - b.latenciaMediaMs);
  console.log(`Rotas que cumprem: ${aprovadas.map((a) => a.rota).join(', ')} → escolhida: ${aprovadas[0].rota}`);
}
