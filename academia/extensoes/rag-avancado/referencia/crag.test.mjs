// Testes do fluxo corretivo (funções simuladas, determinístico).
//   node --test academia/extensoes/rag-avancado/referencia/crag.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIMITES, responderComCorrecao } from './crag.mjs';

const doc = (id, texto = `trecho ${id}`) => ({ id, texto });
const base = (extra = {}) => {
  const gerados = [];
  const p = {
    pergunta: 'quantos dias de férias?',
    recuperar: async () => [doc('a'), doc('b')],
    avaliar: async (_q, docs) => docs.map((d) => ({ id: d.id, nota: d.id === 'a' ? 0.9 : 0.5 })),
    gerar: async (_q, docs) => { gerados.push(docs); return `resposta com ${docs.map((d) => d.id).join(',')}`; },
    ...extra,
  };
  return { p, gerados };
};

describe('classificação e uso das evidências', () => {
  it('recuperação correta: gera só com os trechos bons e registra o rastro', async () => {
    const { p, gerados } = base();
    const r = await responderComCorrecao(p);
    assert.equal(r.acao, 'usar');
    assert.equal(r.classe, 'correta');
    assert.deepEqual(r.docsUsados, ['a']);
    assert.deepEqual(gerados[0].map((d) => d.id), ['a'], 'o trecho de nota 0.5 não vai ao gerador quando há trecho correto');
    assert.deepEqual(r.passos.map((x) => x.passo), ['avaliacao', 'geracao']);
    assert.equal(r.chamadas, 3, 'recuperar + avaliar + gerar');
  });

  it('recuperação incorreta: reescreve a consulta, recupera de novo e usa o que ficou bom', async () => {
    const consultas = [];
    const { p } = base({
      recuperar: async (c) => { consultas.push(c); return c.startsWith('reescrita') ? [doc('bom')] : [doc('ruim')]; },
      avaliar: async (_q, docs) => docs.map((d) => ({ id: d.id, nota: d.id === 'bom' ? 0.95 : 0.05 })),
      reescrever: async (q, n) => `reescrita ${n}: ${q}`,
    });
    const r = await responderComCorrecao(p);
    assert.equal(r.acao, 'usar', 'após a reescrita a recuperação ficou correta');
    assert.deepEqual(consultas, ['quantos dias de férias?', 'reescrita 1: quantos dias de férias?']);
    assert.deepEqual(r.passos.map((x) => x.passo), ['avaliacao', 'reescrita', 'avaliacao', 'geracao']);
    assert.deepEqual(r.docsUsados, ['bom']);
  });

  it('continuou incorreta depois do limite de reescritas: ABSTÉM-SE e nunca chama o gerador', async () => {
    let gerou = false;
    const { p } = base({
      recuperar: async () => [doc('ruim')],
      avaliar: async (_q, docs) => docs.map((d) => ({ id: d.id, nota: 0.1 })),
      reescrever: async () => 'outra consulta', maxReescritas: 2,
      gerar: async () => { gerou = true; return 'x'; },
    });
    const r = await responderComCorrecao(p);
    assert.deepEqual([r.acao, r.abstencao, r.resposta, gerou], ['abstencao', true, null, false]);
    assert.equal(r.passos.filter((x) => x.passo === 'reescrita').length, 2, 'respeita maxReescritas');
    assert.equal(r.passos.at(-1).passo, 'abstencao');
  });

  it('sem reescritor e sem nada recuperado: abstenção direta (e não chama o avaliador com lista vazia)', async () => {
    let avaliou = false;
    const { p } = base({ recuperar: async () => [], avaliar: async () => { avaliou = true; return []; } });
    const r = await responderComCorrecao(p);
    assert.equal(r.abstencao, true);
    assert.equal(avaliou, false);
  });

  it('recuperação ambígua: usa os trechos razoáveis e complementa com a busca externa (só trechos bons entram)', async () => {
    const externas = [];
    const { p, gerados } = base({
      avaliar: async (_q, docs) => docs.map((d) => ({ id: d.id, nota: d.id.startsWith('ext') ? (d.id === 'ext-bom' ? 0.9 : 0.4) : 0.5 })),
      buscaExterna: async (c) => { externas.push(c); return [doc('ext-bom'), doc('ext-fraco')]; },
    });
    const r = await responderComCorrecao(p);
    assert.equal(r.classe, 'ambigua');
    assert.equal(r.acao, 'complementar');
    assert.deepEqual(gerados[0].map((d) => d.id).sort(), ['a', 'b', 'ext-bom']);
    assert.deepEqual(externas, ['quantos dias de férias?']);
    assert.ok(r.passos.some((x) => x.passo === 'complemento_externo' && x.adicionados.join() === 'ext-bom'));
  });

  it('ambígua sem busca externa: responde só com o que há de razoável (nunca abaixo do limiar mínimo)', async () => {
    const { p, gerados } = base({ avaliar: async (_q, docs) => docs.map((d) => ({ id: d.id, nota: d.id === 'a' ? 0.5 : 0.1 })) });
    const r = await responderComCorrecao(p);
    assert.equal(r.classe, 'ambigua');
    assert.deepEqual(gerados[0].map((d) => d.id), ['a']);
  });
});

describe('validação e robustez', () => {
  it('rejeita limiares inválidos e normaliza notas fora de faixa ou ausentes', async () => {
    await assert.rejects(responderComCorrecao(base({ limiares: { correto: 0.3, incorreto: 0.5 } }).p), /limiares inválidos/);
    await assert.rejects(responderComCorrecao(base({ limiares: { correto: 1.5 } }).p), /limiares inválidos/);
    const { p } = base({ avaliar: async (_q, docs) => [{ id: docs[0].id, nota: 7 }, { id: docs[1].id, nota: 'abc' }] });
    const r = await responderComCorrecao(p);
    assert.deepEqual(r.passos[0].notas, [['a', 1], ['b', 0]]);
  });

  it('trecho que o avaliador esqueceu de pontuar conta como nota 0 (nunca vai ao gerador)', async () => {
    const { p, gerados } = base({ avaliar: async () => [{ id: 'a', nota: 0.9 }] });
    await responderComCorrecao(p);
    assert.deepEqual(gerados[0].map((d) => d.id), ['a']);
  });
});

describe('o piso é sempre maior que zero e notas defeituosas não aprovam nada', () => {
  it('limiar mínimo 0 (ou negativo, NaN, texto) é recusado: com 0 todo trecho "passaria"', async () => {
    for (const incorreto of [0, -0.1, NaN, '0.3', null, Infinity]) {
      await assert.rejects(responderComCorrecao(base({ limiares: { incorreto } }).p), /limiares inválidos/, String(incorreto));
    }
    for (const correto of [NaN, Infinity, '0.7', 0.2]) {
      await assert.rejects(responderComCorrecao(base({ limiares: { correto, incorreto: 0.3 } }).p), /limiares inválidos/, String(correto));
    }
    await assert.rejects(responderComCorrecao(base({ limiares: { correto: 0.5, incorreto: 0.5 } }).p), /limiares inválidos/);
  });

  it('nota Infinity, NaN, texto numérico, null, objeto ou ausente vale 0 (Infinity NÃO vira "perfeito")', async () => {
    for (const nota of [Infinity, -Infinity, NaN, '0.99', '1', null, undefined, {}, [0.9], true]) {
      const { p, gerados } = base({ recuperar: async () => [doc('a')], avaliar: async () => [{ id: 'a', nota }] });
      const r = await responderComCorrecao(p);
      assert.equal(r.abstencao, true, `nota ${String(nota)}`);
      assert.equal(gerados.length, 0);
    }
  });

  it('nota 7 e -3 viram 1 e 0 (números finitos fora da faixa são ajustados)', async () => {
    const { p } = base({ avaliar: async (_q, docs) => [{ id: docs[0].id, nota: 7 }, { id: docs[1].id, nota: -3 }] });
    assert.deepEqual((await responderComCorrecao(p)).passos[0].notas, [['a', 1], ['b', 0]]);
  });

  it('ids repetidos na recuperação ou nas notas: vale o primeiro, nunca o último que "melhora" a nota', async () => {
    const { p, gerados } = base({
      recuperar: async () => [doc('a'), doc('a', 'cópia com outro texto')],
      avaliar: async () => [{ id: 'a', nota: 0.1 }, { id: 'a', nota: 0.99 }],
    });
    const r = await responderComCorrecao(p);
    assert.equal(r.abstencao, true);
    assert.equal(gerados.length, 0);
    assert.equal(r.passos[0].descartados, 1);
  });
});

describe('entradas ruins das funções injetadas', () => {
  it('recuperar ou avaliar devolvendo algo que não é lista dá erro claro; trechos malformados são descartados', async () => {
    await assert.rejects(responderComCorrecao(base({ recuperar: async () => 'texto' }).p), /recuperar deve devolver uma lista/);
    await assert.rejects(responderComCorrecao(base({ avaliar: async () => 'ok' }).p), /avaliar deve devolver uma lista/);
    const { p, gerados } = base({ recuperar: async () => [null, 5, { id: 'x' }, { texto: 'sem id' }, { id: '', texto: 't' }, doc('a')], avaliar: async (_q, docs) => docs.map((d) => ({ id: d.id, nota: 0.9 })) });
    const r = await responderComCorrecao(p);
    assert.deepEqual(gerados[0].map((d) => d.id), ['a']);
    assert.equal(r.passos[0].descartados, 5);
  });

  it('limita o número de trechos e o tamanho de cada um antes de avaliar', async () => {
    let vistos;
    const muitos = Array.from({ length: 80 }, (_, i) => ({ id: `d${i}`, texto: 'x'.repeat(20_000) }));
    const { p } = base({ recuperar: async () => muitos, avaliar: async (_q, docs) => { vistos = docs; return []; } });
    await responderComCorrecao(p);
    assert.equal(vistos.length, LIMITES.maxDocs);
    assert.ok(vistos.every((d) => d.texto.length === LIMITES.maxCaracteresPorDoc));
  });

  it('o avaliador recebe cópias: alterar os trechos lá dentro não muda o que o gerador recebe', async () => {
    const { p, gerados } = base({ avaliar: async (_q, docs) => { docs.forEach((d) => { d.texto = 'adulterado'; }); return docs.map((d) => ({ id: d.id, nota: 0.9 })); } });
    await responderComCorrecao(p);
    assert.ok(gerados[0].every((d) => d.texto !== 'adulterado'));
  });

  it('gerador que devolve vazio ou algo que não é texto vira abstenção, não uma resposta vazia', async () => {
    for (const saida of ['', '   ', null, undefined, 42, {}]) {
      const r = await responderComCorrecao(base({ gerar: async () => saida }).p);
      assert.deepEqual([r.abstencao, r.resposta, r.acao], [true, null, 'abstencao'], String(saida));
      assert.equal(r.passos.at(-1).passo, 'abstencao');
    }
  });

  it('reescritor que devolve vazio interrompe as reescritas (sem loop) e termina em abstenção', async () => {
    let reescritas = 0;
    const { p } = base({ recuperar: async () => [doc('ruim')], avaliar: async (_q, docs) => docs.map((d) => ({ id: d.id, nota: 0.05 })), reescrever: async () => { reescritas += 1; return ''; }, maxReescritas: 5 });
    const r = await responderComCorrecao(p);
    assert.equal(reescritas, 1);
    assert.equal(r.abstencao, true);
    assert.ok(r.passos.some((x) => x.passo === 'reescrita_invalida'));
  });
});

describe('configuração', () => {
  it('maxReescritas: só inteiros de 0 a 5 (Infinity causaria loop sem fim); 0 desliga a reescrita', async () => {
    for (const maxReescritas of [Infinity, -1, 1.5, 6, NaN, '2']) {
      await assert.rejects(responderComCorrecao(base({ maxReescritas }).p), /maxReescritas/, String(maxReescritas));
    }
    let reescreveu = false;
    const { p } = base({ recuperar: async () => [doc('ruim')], avaliar: async () => [{ id: 'ruim', nota: 0.01 }], reescrever: async () => { reescreveu = true; return 'x'; }, maxReescritas: 0 });
    assert.equal((await responderComCorrecao(p)).abstencao, true);
    assert.equal(reescreveu, false);
  });

  it('pergunta e funções obrigatórias são validadas', async () => {
    await assert.rejects(responderComCorrecao(base({ pergunta: '' }).p), /pergunta/);
    await assert.rejects(responderComCorrecao(base({ pergunta: 42 }).p), /pergunta/);
    for (const f of ['recuperar', 'avaliar', 'gerar']) await assert.rejects(responderComCorrecao(base({ [f]: undefined }).p), new RegExp(`${f} deve ser uma função`));
    await assert.rejects(responderComCorrecao(base({ reescrever: 'x' }).p), /reescrever deve ser uma função/);
    await assert.rejects(responderComCorrecao(base({ buscaExterna: 5 }).p), /buscaExterna deve ser uma função/);
  });

  it('a busca externa passa pelo mesmo saneamento e avaliação, e não repete trechos já usados', async () => {
    const { p, gerados } = base({
      avaliar: async (_q, docs) => docs.map((d) => ({ id: d.id, nota: d.id === 'a' ? 0.5 : d.id === 'ext-bom' ? 0.9 : 0.1 })),
      buscaExterna: async () => [doc('a', 'repetido da base'), doc('ext-bom'), { id: 'ext-sem-texto' }, null],
    });
    const r = await responderComCorrecao(p);
    assert.deepEqual(gerados[0].map((d) => d.id).sort(), ['a', 'ext-bom']);
    assert.equal(gerados[0].find((d) => d.id === 'a').texto, 'trecho a', 'o texto de a vem da base, não da busca externa');
    assert.ok(r.passos.some((x) => x.passo === 'avaliacao' && x.consulta.startsWith('externa:') && x.descartados === 2));
  });
});
