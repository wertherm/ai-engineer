// Testes adversariais do registro de ferramentas: esquema, argumentos hostis, resultados estranhos, aprovação, auditoria.
//   node --test academia/extensoes/harness-de-agentes/referencia/registro-de-ferramentas.robustez.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { criarRegistro, validarEsquema, verificarEsquema } from './registro-de-ferramentas.mjs';

const base = (extra = {}) => ({
  nome: 'ferramenta_x', descricao: 'Ferramenta de teste que devolve o que recebe, para o harness.', risco: 'leitura',
  esquema: { type: 'object', properties: { texto: { type: 'string', maxLength: 50 } }, required: ['texto'], additionalProperties: false },
  executar: async ({ texto }) => ({ texto }), ...extra,
});
const ESC = String.fromCharCode(0x1b);

describe('verificarEsquema (o cadastro recusa o que a validação não aplicaria)', () => {
  const ok = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false };

  it('aceita um esquema suportado e completo', () => {
    assert.deepEqual(verificarEsquema({ type: 'object', properties: { n: { type: 'integer', minimum: 1, maximum: 5 }, l: { type: 'array', items: { type: 'string', maxLength: 5 } }, e: { enum: ['a', 'b'] } }, required: ['n'], additionalProperties: false }), []);
  });

  it('recusa palavras-chave que seriam ignoradas em silêncio', () => {
    for (const kw of [{ oneOf: [] }, { anyOf: [] }, { allOf: [] }, { not: {} }, { $ref: '#/x' }, { format: 'email' }, { exclusiveMinimum: 1 }, { patternProperties: {} }, { const: 1 }]) {
      const p = verificarEsquema({ type: 'object', properties: { a: { type: 'string', ...kw } }, additionalProperties: false });
      assert.ok(p.some((x) => /não suportada/.test(x)), JSON.stringify(kw));
    }
  });

  it('recusa estruturas malformadas sem lançar exceção', () => {
    const ruins = [
      { type: 'object', properties: null, additionalProperties: false },
      { type: 'object', properties: [], additionalProperties: false },
      { type: 'object', properties: { a: null }, additionalProperties: false },
      { type: 'object', properties: { a: 'string' }, additionalProperties: false },
      { type: 'object', properties: { a: { type: 'quadrado' } }, additionalProperties: false },
      { type: 'object', properties: { a: { enum: [] } }, additionalProperties: false },
      { type: 'object', properties: { a: { enum: [{}] } }, additionalProperties: false },
      { type: 'object', properties: { a: { type: 'string', minLength: -1 } }, additionalProperties: false },
      { type: 'object', properties: { a: { type: 'integer', maximum: Infinity } }, additionalProperties: false },
      { type: 'object', properties: { a: { type: 'array' } }, additionalProperties: false },
      { type: 'object', properties: { a: { type: 'string', items: { type: 'string' } } }, additionalProperties: false },
      { ...ok, required: ['inexistente'] },
      { ...ok, required: 'a' },
      { ...ok, required: ['toString'] },
      { type: 'string', required: ['a'] },
      [],
      null,
    ];
    for (const e of ruins) assert.ok(verificarEsquema(e).length > 0, JSON.stringify(e));
  });

  it('exige additionalProperties: false também nos objetos aninhados', () => {
    const p = verificarEsquema({ type: 'object', properties: { sub: { type: 'object', properties: { x: { type: 'string' } } } }, additionalProperties: false });
    assert.ok(p.some((x) => /sub: declare additionalProperties: false/.test(x)), p.join('|'));
  });

  it('pattern: exige maxLength, limita o tamanho e recusa quantificador dentro de quantificador', () => {
    const com = (pattern, maxLength) => verificarEsquema({ type: 'object', properties: { a: { type: 'string', pattern, ...(maxLength ? { maxLength } : {}) } }, additionalProperties: false });
    assert.deepEqual(com('^[a-z]+$', 100), []);
    assert.ok(com('^[a-z]+$').some((x) => /exige maxLength/.test(x)));
    assert.ok(com('(a+)+$', 100).some((x) => /ReDoS/.test(x)));
    assert.ok(com('(a*)*b', 100).some((x) => /ReDoS/.test(x)));
    assert.ok(com('([a-z]+\\d*)+', 100).some((x) => /ReDoS/.test(x)));
    assert.ok(com('[', 100).some((x) => /inválida/.test(x)));
    assert.ok(com('a'.repeat(201), 100).some((x) => /200 caracteres/.test(x)));
    assert.ok(com('^[a-z]+$', 5000).some((x) => /até 2000/.test(x)));
  });

  it('esquema muito profundo (ou cíclico) é recusado em vez de estourar a pilha', () => {
    let fundo = { type: 'string' };
    for (let i = 0; i < 20; i += 1) fundo = { type: 'object', properties: { f: fundo }, additionalProperties: false };
    assert.ok(verificarEsquema(fundo).some((x) => /aninhamento/.test(x)));
    const ciclico = { type: 'object', properties: {}, additionalProperties: false };
    ciclico.properties.eu = ciclico;
    assert.ok(verificarEsquema(ciclico).some((x) => /aninhamento/.test(x)));
  });

  it('registrar usa a verificação e não lança TypeError com properties: null', () => {
    const r = criarRegistro();
    assert.throws(() => r.registrar(base({ esquema: { type: 'object', properties: null, additionalProperties: false } })), /esquema: deve ser um objeto JSON Schema/);
    assert.throws(() => r.registrar(base({ esquema: { type: 'object', properties: { a: { type: 'string', format: 'email' } }, additionalProperties: false } })), /não suportada/);
    assert.throws(() => r.registrar(base({ nome: 42 })), /nome: use snake_case/);
    assert.throws(() => r.registrar(base({ descricao: `${'x'.repeat(30)}${ESC}[2J` })), /sem caracteres de controle/);
    assert.throws(() => r.registrar(base({ descricao: 'x'.repeat(1001) })), /até 1000/);
  });
});

describe('validarEsquema contra valores hostis', () => {
  const esquema = { type: 'object', properties: { texto: { type: 'string' }, n: { type: 'number' } }, required: ['texto'], additionalProperties: false };

  it('__proto__, constructor e prototype nos argumentos não passam como campos', () => {
    const viaJson = JSON.parse('{"texto":"a","__proto__":{"admin":true}}');
    assert.ok(validarEsquema(esquema, viaJson).some((x) => /campo não previsto/.test(x)));
    assert.ok(validarEsquema(esquema, { texto: 'a', constructor: 1 }).some((x) => /campo não previsto/.test(x)));
    const comPropToString = { type: 'object', properties: { toString: { type: 'string' } }, required: ['toString'], additionalProperties: false };
    assert.ok(validarEsquema(comPropToString, {}).some((x) => /obrigatório/.test(x)), 'required usa propriedade própria');
  });

  it('NaN, Infinity, BigInt, undefined, Date, Map e funções são recusados', () => {
    for (const n of [NaN, Infinity, -Infinity]) assert.ok(validarEsquema(esquema, { texto: 'a', n }).length > 0, String(n));
    assert.ok(validarEsquema(esquema, { texto: 'a', n: 10n }).length > 0);
    assert.ok(validarEsquema(esquema, { texto: undefined }).length > 0);
    assert.ok(validarEsquema(esquema, { texto: () => 1 }).length > 0);
    assert.ok(validarEsquema(esquema, new Date()).some((x) => /objeto inválido/.test(x)));
    assert.ok(validarEsquema(esquema, new Map()).some((x) => /objeto inválido/.test(x)));
    assert.ok(validarEsquema(esquema, { texto: 'a', n: new Number(1) }).some((x) => /objeto inválido/.test(x)));
  });

  it('valor profundo demais ou lista enorme não estoura a pilha nem o tempo', () => {
    let fundo = { type: 'string' };
    let valor = 'x';
    for (let i = 0; i < 30; i += 1) { fundo = { type: 'object', properties: { f: fundo }, additionalProperties: false }; valor = { f: valor }; }
    assert.ok(validarEsquema(fundo, valor).some((x) => /aninhamento/.test(x)));
    const t0 = Date.now();
    assert.ok(validarEsquema({ type: 'array', items: { type: 'string' } }, new Array(20_000).fill('a')).some((x) => /longa demais/.test(x)));
    assert.ok(Date.now() - t0 < 1000);
  });

  it('minItems/maxItems e pattern em texto longo', () => {
    const e = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 };
    assert.ok(validarEsquema(e, []).length && validarEsquema(e, ['a', 'b', 'c']).length && !validarEsquema(e, ['a']).length);
    assert.ok(validarEsquema({ type: 'string', pattern: '^a+$' }, 'a'.repeat(6000)).some((x) => /longo demais/.test(x)));
  });

  it('nomes de campo hostis não vazam para as mensagens', () => {
    const p = validarEsquema(esquema, { texto: 'a', [`${ESC}[31mruim\n`]: 1 });
    assert.ok(p.every((x) => !x.includes(ESC) && !x.includes('\n')));
  });
});

describe('cópia congelada da ferramenta e dos argumentos', () => {
  it('mudar a ferramenta depois do cadastro não muda risco, esquema nem função', async () => {
    const f = base({ nome: 'apaga_tudo', descricao: 'Apaga tudo no projeto. Ação irreversível, exige aprovação.', risco: 'irreversivel', executar: async () => 'apagou' });
    let aprovacoes = 0;
    const r = criarRegistro({ permissoes: ['leitura', 'irreversivel'], aprovar: () => { aprovacoes += 1; return false; } }).registrar(f);
    f.risco = 'leitura';
    f.esquema.properties.texto.maxLength = 1_000_000;
    f.esquema.additionalProperties = true;
    f.executar = async () => 'trocada';
    const res = await r.executar('apaga_tudo', { texto: 'a' });
    assert.equal(res.erro.codigo, 'aprovacao_negada', 'continua exigindo aprovação');
    assert.equal(aprovacoes, 1);
    assert.equal((await r.executar('apaga_tudo', { texto: 'a', extra: 1 })).erro.codigo, 'argumentos_invalidos', 'o esquema original segue fechado');
  });

  it('as definições devolvidas são cópias: mexer nelas não altera o registro', async () => {
    const r = criarRegistro().registrar(base());
    r.definicoes()[0].inputSchema.properties.texto.maxLength = 1;
    r.definicoes()[0].inputSchema.additionalProperties = true;
    assert.equal((await r.executar('ferramenta_x', { texto: 'x'.repeat(10) })).ok, true);
    assert.equal((await r.executar('ferramenta_x', { texto: 'a', extra: 1 })).ok, false);
  });

  it('o que foi validado e aprovado é exatamente o que executa, mesmo se o chamador mexer nos argumentos', async () => {
    const original = { caminho: 'a.txt' };
    let executadoCom;
    const r = criarRegistro({
      permissoes: ['irreversivel'],
      aprovar: async (info) => { original.caminho = '/etc/passwd'; info.argumentos.caminho = '/etc/shadow'; return true; },
    }).registrar({
      nome: 'apagar_arq', descricao: 'Apaga um arquivo do projeto. Ação irreversível, exige aprovação.', risco: 'irreversivel',
      esquema: { type: 'object', properties: { caminho: { type: 'string', maxLength: 100 } }, required: ['caminho'], additionalProperties: false },
      executar: async (a) => { executadoCom = a.caminho; return 'ok'; },
    });
    await r.executar('apagar_arq', original);
    assert.equal(executadoCom, 'a.txt');
  });

  it('argumentos que não são JSON puro (função, classe) viram erro, não exceção', async () => {
    const r = criarRegistro().registrar(base());
    class Coisa { constructor() { this.texto = 'a'; } }
    assert.equal((await r.executar('ferramenta_x', { texto: 'a', f: () => 1 })).erro.codigo, 'argumentos_invalidos');
    assert.equal((await r.executar('ferramenta_x', new Coisa())).erro.codigo, 'argumentos_invalidos');
    assert.equal((await r.executar('ferramenta_x', Object.create(null, { texto: { value: 'a', enumerable: true } }))).ok, true, 'objeto sem protótipo é JSON puro');
  });
});

describe('resultados e erros estranhos da ferramenta', () => {
  const rodar = async (executar) => criarRegistro().registrar(base({ executar })).executar('ferramenta_x', { texto: 'a' });

  it('undefined, null, número, BigInt e objeto viram texto', async () => {
    assert.deepEqual(await rodar(() => undefined), { ok: true, resultado: '', truncado: false });
    assert.deepEqual(await rodar(() => null), { ok: true, resultado: 'null', truncado: false });
    assert.deepEqual(await rodar(() => 5), { ok: true, resultado: '5', truncado: false });
    assert.deepEqual(await rodar(() => ({ n: 10n })), { ok: true, resultado: '{"n":"10"}', truncado: false });
  });

  it('resultado circular, função ou símbolo viram erro estruturado (não exceção, não código-fonte)', async () => {
    const circ = {}; circ.eu = circ;
    for (const valor of [circ, () => 'segredo-no-codigo', Symbol('x')]) {
      const res = await rodar(() => valor);
      assert.equal(res.ok, false);
      assert.equal(res.erro.codigo, 'erro_na_ferramenta');
      assert.ok(!JSON.stringify(res).includes('segredo-no-codigo'));
    }
  });

  it('exceção síncrona, throw de texto, null e objeto não derrubam o registro', async () => {
    for (const lancar of [() => { throw new Error('sincrona'); }, () => { throw 'texto puro'; }, () => { throw null; }, () => { throw { message: 'objeto' }; }]) {
      const res = await rodar(lancar);
      assert.equal(res.erro.codigo, 'erro_na_ferramenta');
    }
  });

  it('segredos no resultado são mascarados e a mensagem de erro não leva controles', async () => {
    const chave = `sk-${'Mm4p'.repeat(8)}`;
    const res = await rodar(() => ({ achado: `a chave ${chave} está no arquivo` }));
    assert.ok(!JSON.stringify(res).includes('Mm4p') && res.resultado.includes('***'));
    const erro = await rodar(() => { throw new Error(`${ESC}[2Jfalhou ${chave}`); });
    assert.ok(!erro.erro.mensagem.includes(ESC) && !erro.erro.mensagem.includes('Mm4p'));
  });

  it('o código "timeout" lançado pela própria ferramenta não é confundido com o tempo esgotado', async () => {
    const res = await rodar(() => { throw Object.assign(new Error('meu timeout'), { codigo: 'timeout' }); });
    assert.equal(res.erro.codigo, 'erro_na_ferramenta');
  });

  it('nome de ferramenta hostil é neutralizado na mensagem', async () => {
    const r = criarRegistro();
    const res = await r.executar(`${ESC}[2Jx`, {});
    assert.equal(res.erro.codigo, 'ferramenta_desconhecida');
    assert.ok(!res.erro.mensagem.includes(ESC));
    assert.equal((await r.executar({ toString: () => 'x' }, {})).erro.codigo, 'ferramenta_desconhecida');
  });
});

describe('timeout e execuções penduradas', () => {
  it('ferramenta que estourou o tempo e não terminou fica ocupada; ao terminar, volta a funcionar', async () => {
    let liberar;
    let chamadas = 0;
    const r = criarRegistro({ timeoutMs: 30 }).registrar(base({
      executar: () => { chamadas += 1; return new Promise((ok) => { liberar = ok; }); },
    }));
    assert.equal((await r.executar('ferramenta_x', { texto: 'a' })).erro.codigo, 'timeout');
    assert.equal((await r.executar('ferramenta_x', { texto: 'b' })).erro.codigo, 'ferramenta_ocupada');
    assert.equal(chamadas, 1, 'não empilhou uma segunda execução');
    liberar('fim');
    await new Promise((ok) => setTimeout(ok, 10));
    assert.equal((await r.executar('ferramenta_x', { texto: 'c' })).erro.codigo, 'timeout', 'voltou a executar (e estourou de novo)');
    assert.equal(chamadas, 2);
  });

  it('rejeição tardia de uma ferramenta que já estourou o tempo não vira erro não tratado', async () => {
    let rejeitar;
    const r = criarRegistro({ timeoutMs: 20 }).registrar(base({ executar: () => new Promise((_, rej) => { rejeitar = rej; }) }));
    const naoTratados = [];
    const ouvinte = (e) => naoTratados.push(e);
    process.on('unhandledRejection', ouvinte);
    try {
      assert.equal((await r.executar('ferramenta_x', { texto: 'a' })).erro.codigo, 'timeout');
      rejeitar(new Error('tarde demais'));
      await new Promise((ok) => setTimeout(ok, 20));
    } finally { process.off('unhandledRejection', ouvinte); }
    assert.deepEqual(naoTratados, []);
  });
});

describe('aprovação humana', () => {
  const apagar = (extra = {}) => base({ nome: 'apagar_arq', descricao: 'Apaga um arquivo do projeto. Ação irreversível, exige aprovação.', risco: 'irreversivel', executar: async () => 'apagado', ...extra });

  it('erro ou rejeição na função de aprovação nega (nunca aprova nem derruba)', async () => {
    for (const aprovar of [() => { throw new Error('caiu'); }, async () => { throw new Error('caiu'); }, async () => undefined, () => 1, async () => 'true']) {
      const r = criarRegistro({ permissoes: ['irreversivel'], aprovar }).registrar(apagar());
      assert.equal((await r.executar('apagar_arq', { texto: 'a' })).erro.codigo, 'aprovacao_negada');
    }
  });

  it('o resumo mostrado a quem decide vem sem controles, sem segredos e com tamanho limitado', async () => {
    const pedidos = [];
    const r = criarRegistro({ permissoes: ['irreversivel'], aprovar: (info) => { pedidos.push(info); return true; } })
      .registrar(apagar({ esquema: { type: 'object', properties: { texto: { type: 'string', maxLength: 5000 } }, required: ['texto'], additionalProperties: false } }));
    const chave = `sk-${'Pp5q'.repeat(8)}`;
    await r.executar('apagar_arq', { texto: `${ESC}[2K${String.fromCharCode(0x202e)}limpo ${chave} ${'y'.repeat(3000)}` });
    const { resumo } = pedidos[0];
    assert.ok(!resumo.includes(ESC) && !resumo.includes(String.fromCharCode(0x202e)) && !resumo.includes('Pp5q'));
    assert.ok(resumo.length <= 1000);
  });

  it('o nome de quem pede (quem) é neutralizado antes de chegar a quem aprova', async () => {
    const pedidos = [];
    const r = criarRegistro({ permissoes: ['irreversivel'], aprovar: (info) => { pedidos.push(info); return true; } }).registrar(apagar());
    await r.executar('apagar_arq', { texto: 'a' }, { quem: `${ESC}[1mchefe${'z'.repeat(200)}` });
    assert.ok(!pedidos[0].quem.includes(ESC) && pedidos[0].quem.length <= 64);
  });
});

describe('auditoria', () => {
  it('escrita e irreversível registram "iniciada" ANTES de executar; leitura não', async () => {
    const eventos = [];
    const r = criarRegistro({ permissoes: ['leitura', 'escrita', 'irreversivel'], aprovar: () => true, auditoria: (e) => eventos.push(`${e.ferramenta}:${e.resultado}`) })
      .registrar(base({ nome: 'ler_algo' }))
      .registrar(base({ nome: 'gravar_algo', risco: 'escrita' }))
      .registrar(base({ nome: 'apagar_algo', risco: 'irreversivel' }));
    for (const n of ['ler_algo', 'gravar_algo', 'apagar_algo']) await r.executar(n, { texto: 'a' });
    assert.deepEqual(eventos, ['ler_algo:ok', 'gravar_algo:iniciada', 'gravar_algo:ok', 'apagar_algo:iniciada', 'apagar_algo:ok']);
  });

  it('auditoria que falha não derruba leitura/escrita, mas BLOQUEIA ação irreversível', async () => {
    let executou = 0;
    const r = criarRegistro({ permissoes: ['leitura', 'escrita', 'irreversivel'], aprovar: () => true, auditoria: () => { throw new Error('disco cheio'); } })
      .registrar(base({ nome: 'ler_algo' }))
      .registrar(base({ nome: 'gravar_algo', risco: 'escrita' }))
      .registrar(base({ nome: 'apagar_algo', risco: 'irreversivel', executar: async () => { executou += 1; return 'x'; } }));
    assert.equal((await r.executar('ler_algo', { texto: 'a' })).ok, true);
    assert.equal((await r.executar('gravar_algo', { texto: 'a' })).ok, true);
    const apagou = await r.executar('apagar_algo', { texto: 'a' });
    assert.equal(apagou.erro.codigo, 'auditoria_indisponivel');
    assert.equal(executou, 0);
    assert.ok(r.falhasDeAuditoria() >= 3);
  });

  it('auditoria assíncrona que rejeita não gera erro não tratado', async () => {
    const naoTratados = [];
    const ouvinte = (e) => naoTratados.push(e);
    process.on('unhandledRejection', ouvinte);
    try {
      const r = criarRegistro({ auditoria: async () => { throw new Error('rede'); } }).registrar(base());
      assert.equal((await r.executar('ferramenta_x', { texto: 'a' })).ok, true);
      await new Promise((ok) => setTimeout(ok, 20));
      assert.equal(r.falhasDeAuditoria(), 1);
    } finally { process.off('unhandledRejection', ouvinte); }
    assert.deepEqual(naoTratados, []);
  });

  it('o evento traz só nomes de argumentos (limitados e sem controles) e o nome de quem já neutralizado', async () => {
    const eventos = [];
    const r = criarRegistro({ auditoria: (e) => eventos.push(e) }).registrar(base());
    const lixo = {};
    for (let i = 0; i < 50; i += 1) lixo[`campo${i}`] = i;
    lixo[`${ESC}[1mx`] = 1;
    await r.executar('ferramenta_x', lixo, { quem: `${ESC}[1mqa` });
    assert.ok(eventos[0].argumentos.length <= 20);
    assert.ok(!JSON.stringify(eventos[0]).includes(ESC));
    assert.equal(eventos[0].resultado, 'argumentos_invalidos');
  });
});

describe('configuração do registro', () => {
  it('recusa valores sem sentido em vez de aceitá-los em silêncio', () => {
    for (const permissoes of [['escrita '], ['write'], 'leitura', [1], null]) assert.throws(() => criarRegistro({ permissoes }), /permissoes/, JSON.stringify(permissoes));
    for (const timeoutMs of [0, -1, NaN, Infinity, '10', 600_001]) assert.throws(() => criarRegistro({ timeoutMs }), /timeoutMs/, String(timeoutMs));
    for (const limiteSaida of [0, 9, 1.5, NaN, '100', 1_000_001]) assert.throws(() => criarRegistro({ limiteSaida }), /limiteSaida/, String(limiteSaida));
    assert.throws(() => criarRegistro({ aprovar: 'sim' }), /aprovar/);
    assert.throws(() => criarRegistro({ auditoria: 5 }), /auditoria/);
  });
});
