// Simulador de entrevista técnica de IA.
//   --sortear N [--seed S] [--categoria C]    sorteia N perguntas (determinístico com seed)
//   --avaliar ID (--resposta "..." | --resposta-arquivo arq) [--llm]
//        nota offline pela cobertura dos pontos-chave; com --llm, pede feedback ao LLM local segundo a rubrica.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
export const banco = JSON.parse(ler('./perguntas.json'));

// PRNG pequeno e determinístico (mulberry32): mesma seed = mesma entrevista, bom para treinar e testar.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sortear(n, seed = Date.now(), categoria) {
  const rnd = mulberry32(seed);
  const pool = banco.filter((p) => !categoria || p.categoria === categoria);
  // Fisher-Yates parcial.
  const copia = [...pool];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}

/** Nota offline: quais pontos-chave a resposta cobre (regex simples; serve de checklist, não de juiz). */
export function avaliarOffline(pergunta, resposta) {
  const cobertos = pergunta.pontosChave.filter((p) => new RegExp(p.padrao, 'i').test(resposta));
  const faltando = pergunta.pontosChave.filter((p) => !cobertos.includes(p));
  return { pct: Math.round((cobertos.length / pergunta.pontosChave.length) * 100), cobertos, faltando };
}

async function feedbackLLM(pergunta, resposta) {
  const { chat, config } = await import('../../comum/llm.js');
  const messages = [
    { role: 'system', content: ler('./rubrica.md') },
    {
      role: 'user',
      content: `Pergunta: ${pergunta.pergunta}\nPontos-chave esperados: ${pergunta.pontosChave.map((p) => p.ponto).join('; ')}\n\nResposta do candidato: ${resposta}`,
    },
  ];
  const r = await chat(messages, { maxTokens: 160 });
  return { ...r, modelo: config.modeloChat };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values: a } = parseArgs({
    options: {
      sortear: { type: 'string' }, seed: { type: 'string' }, categoria: { type: 'string' },
      avaliar: { type: 'string' }, resposta: { type: 'string' }, 'resposta-arquivo': { type: 'string' }, llm: { type: 'boolean' },
    },
  });

  if (a.sortear) {
    const seed = Number(a.seed ?? Date.now());
    console.log(`Entrevista simulada (seed ${seed}) · ${banco.length} perguntas no banco\n`);
    sortear(Number(a.sortear), seed, a.categoria).forEach((p, i) => {
      console.log(`${i + 1}. [${p.categoria} · ${p.nivel}] ${p.pergunta}`);
      console.log(`   avaliar: node exemplos/04-simulador-de-entrevista/simulador.js --avaliar ${p.id} --resposta "..."`);
    });
  } else if (a.avaliar) {
    const p = banco.find((x) => x.id === a.avaliar);
    if (!p) throw new Error(`pergunta ${a.avaliar} não existe; ids: ${banco.map((x) => x.id).join(', ')}`);
    const resposta = a.resposta ?? readFileSync(a['resposta-arquivo'], 'utf8').trim();
    const off = avaliarOffline(p, resposta);
    console.log(`Pergunta: ${p.pergunta}\nResposta: ${resposta}\n`);
    console.log(`Cobertura dos pontos-chave: ${off.pct}%`);
    off.cobertos.forEach((x) => console.log(`  [x] ${x.ponto}`));
    off.faltando.forEach((x) => console.log(`  [ ] ${x.ponto}`));
    console.log(`\nArmadilhas comuns: ${p.armadilhas.join(' · ')}`);
    if (a.llm) {
      console.log('\nPedindo feedback ao LLM (pode levar alguns minutos em CPU)...');
      const r = await feedbackLLM(p, resposta);
      console.log(`\nFeedback (${r.modelo}, ${(r.ms / 1000).toFixed(0)} s, ${r.usage?.completion_tokens ?? '?'} tokens):\n${r.texto.trim()}`);
    }
    console.log(`\nResposta-modelo:\n${p.respostaModelo}`);
  } else {
    console.log('Use --sortear N [--seed S] ou --avaliar ID --resposta "..." [--llm]');
  }
}
