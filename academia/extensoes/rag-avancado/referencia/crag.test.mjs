// Testes do fluxo corretivo (funções simuladas, determinístico).
//   node --test academia/extensoes/rag-avancado/referencia/crag.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { responderComCorrecao } from './crag.mjs';

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
