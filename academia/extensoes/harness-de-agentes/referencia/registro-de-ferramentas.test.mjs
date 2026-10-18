// Testes do registro de ferramentas do harness (sem dependências).
//   node --test academia/extensoes/harness-de-agentes/referencia/registro-de-ferramentas.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { criarRegistro, validarEsquema } from './registro-de-ferramentas.mjs';

const eco = {
  nome: 'eco', descricao: 'Devolve o texto recebido, em maiúsculas, para testar o harness.',
  risco: 'leitura',
  esquema: { type: 'object', properties: { texto: { type: 'string', minLength: 1, maxLength: 20 } }, required: ['texto'], additionalProperties: false },
  executar: async ({ texto }) => ({ eco: texto.toUpperCase() }),
};
const apagar = {
  nome: 'apagar_arquivo', descricao: 'Apaga um arquivo do projeto. Ação irreversível, exige aprovação.',
  risco: 'irreversivel',
  esquema: { type: 'object', properties: { caminho: { type: 'string' } }, required: ['caminho'], additionalProperties: false },
  executar: async ({ caminho }) => `apagado ${caminho}`,
};
const gravar = {
  nome: 'gravar_nota', descricao: 'Grava uma nota no projeto (escrita reversível, via controle de versão).',
  risco: 'escrita',
  esquema: { type: 'object', properties: { nota: { type: 'string' } }, required: ['nota'], additionalProperties: false },
  executar: async () => 'gravada',
};

describe('contrato da ferramenta', () => {
  it('rejeita o cadastro de ferramentas mal descritas, com todos os motivos de uma vez', () => {
    const r = criarRegistro();
    assert.throws(() => r.registrar({ nome: 'X', descricao: 'curta', esquema: { type: 'object', properties: {} }, executar: () => {} }),
      (e) => /nome: use snake_case/.test(e.message) && /descricao: explique/.test(e.message) && /additionalProperties: false/.test(e.message) && /risco: declare/.test(e.message));
    assert.throws(() => r.registrar({ ...eco, executar: 'não é função' }), /executar: deve ser uma função/);
    assert.throws(() => r.registrar({ ...eco, esquema: { type: 'string' } }), /esquema: deve ser um objeto/);
    assert.throws(() => r.registrar(null), /ferramenta inválida/);
    r.registrar(eco);
    assert.throws(() => r.registrar(eco), /já existe uma ferramenta/);
  });

  it('as definições para o modelo não vazam risco nem função de execução', () => {
    const r = criarRegistro().registrar(eco).registrar(apagar);
    const defs = r.definicoes();
    assert.deepEqual(defs.map((d) => d.name), ['eco', 'apagar_arquivo']);
    for (const d of defs) assert.deepEqual(Object.keys(d).sort(), ['description', 'inputSchema', 'name']);
  });
});

describe('validação dos argumentos', () => {
  it('rejeita tipo errado, campo ausente, campo extra, tamanho e enum — sem executar', async () => {
    let chamadas = 0;
    const r = criarRegistro().registrar({ ...eco, executar: async (a) => { chamadas += 1; return a; } });
    for (const args of [{}, { texto: 5 }, { texto: '' }, { texto: 'x'.repeat(21) }, { texto: 'ok', extra: 1 }, null, [], 'texto']) {
      const res = await r.executar('eco', args);
      assert.equal(res.ok, false, JSON.stringify(args));
      assert.equal(res.erro.codigo, 'argumentos_invalidos');
    }
    assert.equal(chamadas, 0, 'a ferramenta nunca rodou com argumento inválido');
    assert.deepEqual((await r.executar('eco', { texto: 5 })).erro.problemas, ['argumentos.texto: esperado string, veio integer']);
  });

  it('validarEsquema cobre enum, números, arrays e objetos aninhados', () => {
    const esquema = { type: 'object', properties: {
      modo: { enum: ['a', 'b'] }, n: { type: 'integer', minimum: 1, maximum: 3 }, tags: { type: 'array', items: { type: 'string', pattern: '^[a-z]+$' } },
      sub: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] },
    }, additionalProperties: false };
    assert.deepEqual(validarEsquema(esquema, { modo: 'a', n: 2, tags: ['ok'], sub: { x: 1.5 } }), []);
    const p = validarEsquema(esquema, { modo: 'c', n: 4, tags: ['ok', 'NÃO'], sub: {} });
    assert.equal(p.length, 4);
    assert.ok(p.some((x) => /modo/.test(x)) && p.some((x) => /máximo 3/.test(x)) && p.some((x) => /tags\[1\]/.test(x)) && p.some((x) => /sub\.x: obrigatório/.test(x)));
  });
});

describe('permissões e aprovação humana', () => {
  it('por padrão só leitura é liberada; escrita e irreversível exigem liberação explícita', async () => {
    const r = criarRegistro().registrar(eco).registrar(gravar).registrar(apagar);
    assert.equal((await r.executar('eco', { texto: 'a' })).ok, true);
    assert.equal((await r.executar('gravar_nota', { nota: 'x' })).erro.codigo, 'sem_permissao');
    assert.equal((await r.executar('apagar_arquivo', { caminho: 'a' })).erro.codigo, 'sem_permissao');
  });

  it('irreversível sem função de aprovação é sempre negado, e só um `true` exato aprova', async () => {
    const semAprovador = criarRegistro({ permissoes: ['leitura', 'escrita', 'irreversivel'] }).registrar(apagar);
    assert.equal((await semAprovador.executar('apagar_arquivo', { caminho: 'a' })).erro.codigo, 'aprovacao_negada');
    const talvez = criarRegistro({ permissoes: ['irreversivel'], aprovar: () => 'sim' }).registrar(apagar);
    assert.equal((await talvez.executar('apagar_arquivo', { caminho: 'a' })).erro.codigo, 'aprovacao_negada', '"sim" não é true');
    const pedidos = [];
    const humano = criarRegistro({ permissoes: ['irreversivel'], aprovar: async (info) => { pedidos.push(info); return true; } }).registrar(apagar);
    const res = await humano.executar('apagar_arquivo', { caminho: 'a.txt' }, { quem: 'agente-x' });
    assert.deepEqual(res, { ok: true, resultado: 'apagado a.txt', truncado: false });
    assert.deepEqual(pedidos, [{ ferramenta: 'apagar_arquivo', risco: 'irreversivel', argumentos: { caminho: 'a.txt' }, quem: 'agente-x' }]);
  });

  it('argumento inválido é barrado ANTES de pedir aprovação ao humano', async () => {
    let perguntou = 0;
    const r = criarRegistro({ permissoes: ['irreversivel'], aprovar: () => { perguntou += 1; return true; } }).registrar(apagar);
    assert.equal((await r.executar('apagar_arquivo', {})).erro.codigo, 'argumentos_invalidos');
    assert.equal(perguntou, 0);
  });
});

describe('robustez de execução', () => {
  it('ferramenta desconhecida, exceção e timeout viram erros estruturados (sem stack e sem segredo)', async () => {
    const segredo = 'sk-' + 'Hh7k'.repeat(6);
    const r = criarRegistro({ timeoutMs: 50 })
      .registrar({ ...eco, nome: 'quebra', executar: async () => { throw new Error(`falhou com ${segredo}`); } })
      .registrar({ ...eco, nome: 'lenta', executar: () => new Promise(() => {}) });
    assert.equal((await r.executar('nao_existe', {})).erro.codigo, 'ferramenta_desconhecida');
    const q = await r.executar('quebra', { texto: 'a' });
    assert.equal(q.erro.codigo, 'erro_na_ferramenta');
    assert.ok(!JSON.stringify(q).includes(segredo) && !/at .*\.mjs/.test(JSON.stringify(q)));
    assert.equal((await r.executar('lenta', { texto: 'a' })).erro.codigo, 'timeout');
  });

  it('o sinal de cancelamento chega à ferramenta quando o tempo esgota', async () => {
    let cancelada = false;
    const r = criarRegistro({ timeoutMs: 30 }).registrar({
      ...eco, nome: 'espera',
      executar: (_a, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => { cancelada = true; rej(new Error('abortada')); })),
    });
    assert.equal((await r.executar('espera', { texto: 'a' })).erro.codigo, 'timeout');
    assert.equal(cancelada, true);
  });

  it('limita o tamanho da saída devolvida ao modelo', async () => {
    const r = criarRegistro({ limiteSaida: 10 }).registrar({ ...eco, nome: 'grande', executar: async () => 'x'.repeat(50) });
    const res = await r.executar('grande', { texto: 'a' });
    assert.deepEqual(res, { ok: true, resultado: 'x'.repeat(10), truncado: true });
  });
});

describe('auditoria', () => {
  it('registra cada chamada com os NOMES dos argumentos, nunca os valores', async () => {
    const eventos = [];
    const r = criarRegistro({ auditoria: (e) => eventos.push(e) }).registrar(eco).registrar(gravar);
    await r.executar('eco', { texto: 'valor-confidencial' }, { quem: 'qa' });
    await r.executar('gravar_nota', { nota: 'x' });
    await r.executar('eco', { texto: 5 });
    assert.deepEqual(eventos.map((e) => [e.ferramenta, e.resultado, e.quem]), [['eco', 'ok', 'qa'], ['gravar_nota', 'sem_permissao', 'agente'], ['eco', 'argumentos_invalidos', 'agente']]);
    assert.deepEqual(eventos[0].argumentos, ['texto']);
    assert.ok(!JSON.stringify(eventos).includes('valor-confidencial'));
    assert.ok(eventos.every((e) => typeof e.ms === 'number' && e.quando));
  });
});
