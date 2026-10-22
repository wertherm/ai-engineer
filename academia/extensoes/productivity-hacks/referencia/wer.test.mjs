// node --test academia/extensoes/productivity-hacks/referencia/wer.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { palavras, wer, werDoConjunto } from './wer.mjs';

describe('wer', () => {
  it('texto igual dá zero; pontuação e maiúsculas não contam', () => {
    assert.equal(wer('Olá, Mundo!', 'olá mundo').wer, 0);
    assert.equal(wer('o gato subiu no telhado', 'O gato subiu no telhado.').erros, 0);
  });

  it('conta remoção, substituição e inserção, e o total é a distância de edição', () => {
    const remocao = wer('o gato subiu no telhado', 'o gato subiu telhado');
    assert.equal(remocao.erros, 1);
    assert.equal(remocao.remocoes, 1);
    assert.equal(remocao.wer, 1 / 5);
    const troca = wer('um dois três', 'um dez três');
    assert.deepEqual([troca.substituicoes, troca.erros, troca.wer], [1, 1, 1 / 3]);
    const sobra = wer('a b c', 'a x b c y');
    assert.equal(sobra.insercoes, 2);
    assert.equal(sobra.erros, 2);
  });

  it('o WER pode passar de 100% quando a ferramenta inventa texto (ex.: transcrever silêncio)', () => {
    const r = wer('oi', 'oi oi oi');
    assert.equal(r.insercoes, 2);
    assert.equal(r.wer, 2);
  });

  it('hipótese vazia: todas as palavras da referência foram perdidas', () => {
    const r = wer('um dois três', '');
    assert.deepEqual([r.wer, r.remocoes, r.palavrasReferencia], [1, 3, 3]);
  });

  it('acentos contam por padrão e podem ser ignorados; "10" e "dez" são palavras diferentes', () => {
    assert.equal(wer('ação', 'acao').wer, 1);
    assert.equal(wer('ação', 'acao', { semAcentos: true }).wer, 0);
    assert.equal(wer('pago 10 reais', 'pago dez reais').erros, 1);
  });

  it('palavras: hífen e apóstrofo no meio fazem parte da palavra; símbolos soltos não', () => {
    assert.deepEqual(palavras("guarda-chuva d'água — ok!"), ['guarda-chuva', "d'água", 'ok']);
    assert.deepEqual(palavras(''), []);
  });

  it('referência sem palavras é erro de uso (não existe WER sem referência)', () => {
    assert.throws(() => wer('...', 'qualquer coisa'), RangeError);
    assert.throws(() => wer('', ''), RangeError);
  });
});

describe('werDoConjunto', () => {
  it('soma erros e palavras (frase longa pesa mais), em vez de tirar a média dos percentuais', () => {
    const r = werDoConjunto([
      { referencia: 'a b c d e f g h i j', hipotese: 'a b c d e f g h i j' },
      { referencia: 'x', hipotese: 'y' },
    ]);
    assert.equal(r.palavrasReferencia, 11);
    assert.equal(r.erros, 1);
    assert.ok(Math.abs(r.wer - 1 / 11) < 1e-12, `esperado 1/11 e veio ${r.wer} (a média dos percentuais daria 0,5)`);
    assert.equal(r.frases.length, 2);
  });

  it('exige ao menos um par', () => {
    assert.throws(() => werDoConjunto([]), RangeError);
    assert.throws(() => werDoConjunto('texto'), RangeError);
  });
});

describe('entrada errada não vira nota perfeita', () => {
  it('texto que não é string (undefined, null, número) é erro, não "undefined" contra "undefined" = 0%', () => {
    for (const ruim of [undefined, null, 42, {}, ['a']]) {
      assert.throws(() => wer(ruim, 'undefined'), TypeError, String(ruim));
      assert.throws(() => wer('uma frase', ruim), TypeError, String(ruim));
    }
  });

  it('werDoConjunto recusa pares com os nomes de campo errados (antes dava 0% de erro)', () => {
    assert.throws(() => werDoConjunto([{ ref: 'a b', hip: 'x y' }]), /par 1 precisa ser {referencia: string, hipotese: string}/);
    assert.throws(() => werDoConjunto([{ referencia: 'a b', hipotese: 'a b' }, null]), TypeError);
    assert.throws(() => werDoConjunto([{ referencia: 'a b' }]), TypeError);
  });
});
