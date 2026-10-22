// Por que o backoff precisa de JITTER: uma simulação offline, determinística e de BRINQUEDO (nenhuma rede, nenhum LLM).
//
//   node academia/licoes/02-apis-erros-e-integracao/exemplos/backoff-simulado.mjs [clientes] [capacidade-por-janela]
//
// Cenário: `clientes` aplicações pedem ao mesmo tempo a um servidor que atende no máximo `capacidade` pedidos por janela de 100 ms; o excedente
// recebe uma recusa (429/503) e tenta de novo. Três estratégias de espera entre as tentativas, todas com teto de 64 janelas:
//   sem-espera   tenta de novo na janela seguinte;
//   exponencial  espera 4, 8, 16, 32... janelas (sem sorteio): todos que falharam juntos voltam juntos;
//   full-jitter  sorteia a espera entre 1 e o valor do exponencial.
// O modelo é propositalmente simples: mostra a FORMA do problema (rajadas sincronizadas), não números de produção. Ele NÃO modela o custo de
// uma recusa nem um servidor que cai sob carga. Fontes na seção 5 da lição.

const CLIENTES = Number(process.argv[2] ?? 200);
const CAPACIDADE = Number(process.argv[3] ?? 20);
const BASE_JANELAS = 4; // espera base: 400 ms (a mesma ordem de grandeza do BACKOFF_BASE_MS padrão do laboratório)
const TETO_JANELAS = 64;
const MS_POR_JANELA = 100;

/** Gerador pseudoaleatório com semente (mulberry32): o mesmo resultado em qualquer máquina. */
function aleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ESTRATEGIAS = {
  'sem-espera': () => 1,
  'exponencial': (falhas) => Math.min(TETO_JANELAS, BASE_JANELAS * 2 ** (falhas - 1)),
  'full-jitter': (falhas, rand) => Math.max(1, Math.ceil(rand() * Math.min(TETO_JANELAS, BASE_JANELAS * 2 ** (falhas - 1)))),
};

function simular(esperar, semente) {
  const rand = aleatorio(semente);
  const proximo = new Array(CLIENTES).fill(0); // janela da próxima tentativa de cada cliente
  const falhas = new Array(CLIENTES).fill(0);
  const pronto = new Array(CLIENTES).fill(false);
  let restantes = CLIENTES;
  let pedidosTotais = 0;
  let rajadaDeRetentativas = 0; // maior número de pedidos numa janela depois da primeira (a primeira é o pico inevitável)
  let ociosas = 0; // janelas em que o servidor tinha capacidade sobrando e ainda havia gente por atender
  let janela = 0;
  while (restantes > 0 && janela < 100_000) {
    const quem = [];
    for (let i = 0; i < CLIENTES; i++) if (!pronto[i] && proximo[i] === janela) quem.push(i);
    if (janela > 0) rajadaDeRetentativas = Math.max(rajadaDeRetentativas, quem.length);
    if (quem.length < CAPACIDADE) ociosas++;
    pedidosTotais += quem.length;
    // o servidor atende os primeiros `capacidade` da janela (a ordem dos clientes é arbitrária mas fixa)
    quem.forEach((cliente, posicao) => {
      if (posicao < CAPACIDADE) { pronto[cliente] = true; restantes--; return; }
      falhas[cliente]++;
      proximo[cliente] = janela + esperar(falhas[cliente], rand);
    });
    janela++;
  }
  return { pedidosTotais, rajadaDeRetentativas, ociosas, janelas: janela };
}

console.log(`${CLIENTES} clientes, servidor atende ${CAPACIDADE} pedidos por janela de ${MS_POR_JANELA} ms\n`);
console.log('estratégia   | pedidos enviados | maior rajada de retentativas | janelas com servidor ocioso | tempo até todos terminarem');
console.log('-------------|------------------|------------------------------|-----------------------------|---------------------------');
for (const [nome, esperar] of Object.entries(ESTRATEGIAS)) {
  const r = simular(esperar, 42);
  console.log(`${nome.padEnd(12)} | ${String(r.pedidosTotais).padStart(16)} | ${String(r.rajadaDeRetentativas).padStart(28)} | ${String(r.ociosas).padStart(27)} | ${String(r.janelas * MS_POR_JANELA).padStart(23)} ms`);
}
console.log('\nLeitura (e cuidado com o brinquedo): sem espera, o servidor nunca fica ocioso e por isso termina primeiro AQUI, mas cada recusa é um pedido que ele teve de receber;');
console.log('neste modelo ela é de graça, na vida real não é (carga, limites de taxa e retentativas que derrubam um servidor já sobrecarregado: seção 4.2). Com espera exponencial');
console.log('SEM sorteio, quem falhou junto volta junto: rajadas idênticas separadas por silêncio (servidor ocioso). O sorteio espalha as voltas: menos pedidos desperdiçados que');
console.log('sem espera e muito menos tempo ocioso que o exponencial puro.');
