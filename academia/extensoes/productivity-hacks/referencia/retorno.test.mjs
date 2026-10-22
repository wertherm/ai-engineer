// node --test academia/extensoes/productivity-hacks/referencia/retorno.test.mjs
// ATENÇÃO: todos os números abaixo são FICTÍCIOS (servem para conferir a conta, não representam mercado nem ganho típico).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cenarioPessimista, custoDeInferencia, horasQueValeInvestir, margemDaAssinatura, retornoDaAutomacao } from './retorno.mjs';

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} não está perto de ${b}`);

// relatório semanal de 2 h que cai para 0,5 h de revisão (economia líquida de 1,5 h); hora de R$ 40; 12 h para construir;
// 1 h de manutenção por mês; R$ 5 de API por mês
const BASE = { horasEconomizadasPorSemana: 1.5, valorDaHora: 40, horasParaConstruir: 12, horasDeManutencaoPorMes: 1, custoDeUsoPorMes: 5 };

describe('retornoDaAutomacao', () => {
  it('reproduz o exemplo fictício: ganho semanal, payback e ganho no ano', () => {
    const r = retornoDaAutomacao(BASE);
    perto(r.ganhoBrutoSemanal, 60);
    perto(r.custoDeManutencaoSemanal, 40 * 12 / 52);
    perto(r.ganhoSemanal, 60 - 40 * 12 / 52 - 5 * 12 / 52);
    assert.equal(r.ganhoSemanal.toFixed(2), '49.62');
    assert.equal(r.paybackEmSemanas.toFixed(1), '9.7');
    perto(r.ganhoNoPeriodo, 2100); // 49,6154 x 52 - 480
    assert.equal(r.vale, true);
  });

  it('cenário pessimista: se a economia real é metade, o payback passa de 24 semanas', () => {
    const r = cenarioPessimista(BASE, 0.5);
    assert.equal(r.ganhoSemanal.toFixed(2), '19.62');
    assert.equal(r.paybackEmSemanas.toFixed(1), '24.5');
  });

  it('tarefa rara não paga a construção: 2 vezes por ano, 1,5 h cada', () => {
    const rara = { horasEconomizadasPorSemana: (2 * 1.5) / 52, valorDaHora: 40, horasParaConstruir: 12 };
    const noAno = retornoDaAutomacao(rara);
    perto(noAno.ganhoNoPeriodo, 120 - 480);
    assert.equal(noAno.vale, false);
    assert.equal(Math.round(noAno.paybackEmSemanas), 208); // quatro anos só para empatar
  });

  it('se manutenção e uso custam mais que a economia, nunca se paga (payback infinito)', () => {
    const r = retornoDaAutomacao({ ...BASE, horasEconomizadasPorSemana: 0.1 });
    assert.equal(r.paybackEmSemanas, Infinity);
    assert.equal(r.vale, false);
  });

  it('semanasDeUso muda o resultado', () => {
    assert.equal(retornoDaAutomacao({ ...BASE, semanasDeUso: 8 }).vale, false);
    assert.equal(retornoDaAutomacao({ ...BASE, semanasDeUso: 12 }).vale, true);
  });

  it('entradas inválidas são recusadas com mensagem clara', () => {
    assert.throws(() => retornoDaAutomacao({ ...BASE, valorDaHora: -1 }), RangeError);
    assert.throws(() => retornoDaAutomacao({ ...BASE, horasParaConstruir: NaN }), TypeError);
    assert.throws(() => retornoDaAutomacao({ ...BASE, horasParaConstruir: '12' }), TypeError);
    assert.throws(() => retornoDaAutomacao({ ...BASE, semanasDeUso: 0 }), RangeError);
    assert.throws(() => retornoDaAutomacao({ ...BASE, semanasDeUso: 10.5 }), RangeError);
    assert.throws(() => cenarioPessimista(BASE, 0), RangeError);
    assert.throws(() => cenarioPessimista(BASE, 1.5), RangeError);
  });
});

describe('horasQueValeInvestir (regra de bolso)', () => {
  it('5 minutos, 5 vezes por semana, durante 5 anos', () => {
    perto(horasQueValeInvestir({ minutosEconomizadosPorVez: 5, vezesPorSemana: 5 }), (5 * 5 * 52 * 5) / 60);
  });
  it('tarefa que quase não acontece tem teto baixo', () => {
    assert.ok(horasQueValeInvestir({ minutosEconomizadosPorVez: 10, vezesPorSemana: 1 / 26 }) < 10);
  });
});

describe('assinatura de bot: o usuário pesado quebra a conta', () => {
  // preços de API e taxas FICTÍCIOS escolhidos para o exemplo; nada disto é tabela de preços de ninguém
  const ASSINATURA = {
    precoMensal: 49, mensagensPorMes: 200, tokensEntradaPorMensagem: 4000, tokensSaidaPorMensagem: 600,
    precoEntradaPorMTok: 2, precoSaidaPorMTok: 10, cambio: 5.5, taxaPercentual: 0.0399 + 0.007, taxaFixa: 0.39,
  };

  it('custo de inferência por milhão de tokens', () => {
    perto(custoDeInferencia({ tokensEntrada: 800_000, tokensSaida: 120_000, precoEntradaPorMTok: 2, precoSaidaPorMTok: 10 }), 2.8);
  });

  it('usuário médio deixa margem; o de uso 5 vezes maior dá prejuízo', () => {
    const medio = margemDaAssinatura(ASSINATURA);
    perto(medio.custoDeInferenciaMensal, 15.4);
    perto(medio.taxasDePagamento, 49 * 0.0469 + 0.39);
    assert.equal(medio.sobra.toFixed(2), '30.91');
    assert.equal(medio.dandoPrejuizo, false);
    const pesado = margemDaAssinatura({ ...ASSINATURA, fatorDeUso: 5 });
    perto(pesado.custoDeInferenciaMensal, 77);
    assert.equal(pesado.dandoPrejuizo, true);
    assert.ok(pesado.sobra < 0);
  });

  it('recusa parâmetros que não fazem sentido', () => {
    assert.throws(() => margemDaAssinatura({ ...ASSINATURA, cambio: 0 }), RangeError);
    assert.throws(() => margemDaAssinatura({ ...ASSINATURA, fatorDeUso: 0 }), RangeError);
    assert.throws(() => margemDaAssinatura({ ...ASSINATURA, precoMensal: -5 }), RangeError);
  });
});

describe('entrada errada é recusada em vez de virar um número plausível', () => {
  it('cenarioPessimista valida ANTES de multiplicar (string, null, true e lista não viram número)', () => {
    for (const ruim of ['1.5', null, true, [2], undefined]) {
      assert.throws(() => cenarioPessimista({ ...BASE, horasEconomizadasPorSemana: ruim }), TypeError, String(ruim));
      assert.throws(() => retornoDaAutomacao({ ...BASE, horasEconomizadasPorSemana: ruim }), TypeError, String(ruim));
    }
    assert.throws(() => retornoDaAutomacao(null), TypeError);
    assert.throws(() => cenarioPessimista(undefined), TypeError);
  });

  it('valores gigantes não viram NaN em silêncio', () => {
    assert.throws(() => retornoDaAutomacao({ ...BASE, valorDaHora: 1e200 }), RangeError);
    assert.throws(() => retornoDaAutomacao({ ...BASE, semanasDeUso: 1e9 }), RangeError);
    assert.throws(() => retornoDaAutomacao({ ...BASE, horasParaConstruir: Infinity }), TypeError);
  });

  it('taxaPercentual é uma fração: 4.69 (por cento) seria 469% e é recusado; 0.0469 vale', () => {
    const base = { precoMensal: 49, mensagensPorMes: 200, tokensEntradaPorMensagem: 4000, tokensSaidaPorMensagem: 600, precoEntradaPorMTok: 2, precoSaidaPorMTok: 10, cambio: 5.5 };
    assert.throws(() => margemDaAssinatura({ ...base, taxaPercentual: 4.69 }), RangeError);
    assert.doesNotThrow(() => margemDaAssinatura({ ...base, taxaPercentual: 0.0469 }));
  });

  it('preço zero: não existe margem percentual (null, não -Infinity); só é prejuízo se houver custo', () => {
    const base = { precoMensal: 0, mensagensPorMes: 200, tokensEntradaPorMensagem: 4000, tokensSaidaPorMensagem: 600, precoEntradaPorMTok: 2, precoSaidaPorMTok: 10, cambio: 5.5 };
    const r = margemDaAssinatura(base);
    assert.equal(r.margem, null);
    assert.equal(r.dandoPrejuizo, true);
    assert.equal(margemDaAssinatura({ ...base, mensagensPorMes: 0 }).dandoPrejuizo, false);
  });
});
