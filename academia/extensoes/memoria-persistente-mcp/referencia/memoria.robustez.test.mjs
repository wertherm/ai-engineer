// Testes de robustez da memória: vários processos no mesmo arquivo, compactação, arquivo danificado, texto enganoso.
//   node --test academia/extensoes/memoria-persistente-mcp/referencia/memoria.robustez.test.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import { criarMemoria, ErroDeMemoria, LIMITES } from './memoria.mjs';

const tmps = [];
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }); });
const arquivoTmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-r-'));
  tmps.push(d);
  return path.join(d, 'memoria.jsonl');
};
const abrir = (arquivo, extra = {}) => criarMemoria({ arquivo, escoposPermitidos: ['proj-a'], ...extra });
const erroCom = (fn, codigo) => assert.throws(fn, (e) => e instanceof ErroDeMemoria && e.codigo === codigo, `esperava ${codigo}`);
const evento = (extra = {}) => JSON.stringify({ op: 'salvar', id: 'x', escopo: 'proj-a', chave: 'k', tipo: 'nota', valor: 'v', fonte: 't', em: '2026-01-01T00:00:00.000Z', ...extra });

describe('vários processos no mesmo arquivo', () => {
  it('uma instância enxerga o que a outra gravou, sem reabrir', () => {
    const arquivo = arquivoTmp();
    const a = abrir(arquivo);
    const b = abrir(arquivo);
    a.salvar({ escopo: 'proj-a', chave: 'da-a', valor: 'veio de A' });
    assert.deepEqual(b.buscar({ escopo: 'proj-a' }).itens.map((i) => i.chave), ['da-a']);
    b.salvar({ escopo: 'proj-a', chave: 'da-b', valor: 'veio de B' });
    assert.equal(a.buscar({ escopo: 'proj-a' }).total, 2);
    assert.equal(b.esquecer({ escopo: 'proj-a', chave: 'da-a' }).removida, true);
    assert.equal(a.buscar({ escopo: 'proj-a' }).total, 1, 'o esquecimento de B vale para A');
  });

  it('upsert e limite por escopo consideram o que o outro processo gravou', () => {
    const arquivo = arquivoTmp();
    const a = abrir(arquivo, { limiteRegistrosPorEscopo: 1 });
    const b = abrir(arquivo, { limiteRegistrosPorEscopo: 1 });
    a.salvar({ escopo: 'proj-a', chave: 'unica', valor: 'um' });
    assert.equal(b.salvar({ escopo: 'proj-a', chave: 'unica', valor: 'dois' }).substituiu, true);
    erroCom(() => b.salvar({ escopo: 'proj-a', chave: 'outra', valor: 'x' }), 'escopo_cheio');
  });

  it('processos de verdade gravando ao mesmo tempo não perdem nem misturam registros', async () => {
    const arquivo = arquivoTmp();
    abrir(arquivo); // cria a pasta
    const aqui = path.dirname(fileURLToPath(import.meta.url));
    const filho = path.join(path.dirname(arquivo), 'filho.mjs');
    fs.writeFileSync(filho, [
      `import { criarMemoria } from ${JSON.stringify(pathToFileURL(path.join(aqui, 'memoria.mjs')).href)};`,
      `const m = criarMemoria({ arquivo: ${JSON.stringify(arquivo)}, escoposPermitidos: ['proj-a'] });`,
      'const id = process.argv[2];',
      "for (let i = 0; i < 25; i += 1) m.salvar({ escopo: 'proj-a', chave: `p${id}.i${i}`, valor: `valor ${id} ${i}` });",
    ].join('\n'));
    const rodar = (id) => new Promise((ok, falha) => {
      execFile(process.execPath, [filho, id], (erro, _out, err) => (erro ? falha(new Error(err || erro.message)) : ok()));
    });
    await Promise.all(['1', '2', '3', '4'].map(rodar)); // quatro processos ao mesmo tempo
    const m = abrir(arquivo);
    assert.equal(m.buscar({ escopo: 'proj-a', limite: LIMITES.resultadosMax }).total, 100);
    const linhas = fs.readFileSync(arquivo, 'utf8').trim().split('\n');
    assert.equal(linhas.length, 100);
    linhas.forEach((l) => assert.doesNotThrow(() => JSON.parse(l)));
  });

  it('uma linha ainda incompleta no fim do arquivo é ignorada até terminar; gravar por cima dela é recusado', () => {
    const arquivo = arquivoTmp();
    const m = abrir(arquivo);
    m.salvar({ escopo: 'proj-a', chave: 'a', valor: 'completo' });
    fs.appendFileSync(arquivo, evento({ chave: 'b' }).slice(0, 20)); // outro processo no meio de uma escrita
    assert.equal(m.buscar({ escopo: 'proj-a' }).total, 1, 'a metade não conta');
    erroCom(() => m.salvar({ escopo: 'proj-a', chave: 'c', valor: 'x' }), 'arquivo_corrompido');
    fs.truncateSync(arquivo, fs.readFileSync(arquivo, 'utf8').indexOf('\n') + 1); // conserto manual
    assert.ok(m.salvar({ escopo: 'proj-a', chave: 'c', valor: 'agora vai' }).id);
  });
});

describe('compactar', () => {
  it('apaga do disco o que foi esquecido, o que expirou e o histórico; mantém o vigente', () => {
    let agora = new Date('2026-10-18T00:00:00Z');
    const arquivo = arquivoTmp();
    const m = abrir(arquivo, { agora: () => agora });
    m.salvar({ escopo: 'proj-a', chave: 'fica', valor: 'versao antiga' });
    m.salvar({ escopo: 'proj-a', chave: 'fica', valor: 'versao nova' });
    m.salvar({ escopo: 'proj-a', chave: 'sai', valor: 'conteudo para esquecer' });
    m.esquecer({ escopo: 'proj-a', chave: 'sai' });
    m.salvar({ escopo: 'proj-a', chave: 'temp', valor: 'expira logo', ttl_dias: 1 });
    agora = new Date('2026-10-25T00:00:00Z');
    assert.equal(fs.readFileSync(arquivo, 'utf8').includes('conteudo para esquecer'), true, 'antes de compactar o rastro existe');
    assert.deepEqual(m.compactar(), { mantidas: 1, removidas: 1 });
    const texto = fs.readFileSync(arquivo, 'utf8');
    assert.ok(!texto.includes('conteudo para esquecer') && !texto.includes('versao antiga') && !texto.includes('expira logo'));
    assert.deepEqual(m.buscar({ escopo: 'proj-a' }).itens.map((i) => i.valor), ['versao nova']);
    assert.ok(m.salvar({ escopo: 'proj-a', chave: 'depois', valor: 'segue funcionando' }).id);
    assert.equal(abrir(arquivo, { agora: () => agora }).buscar({ escopo: 'proj-a' }).total, 2);
    assert.ok(!fs.existsSync(`${arquivo}.lock`), 'a trava é removida');
  });

  it('outra instância percebe a compactação e continua correta', () => {
    const arquivo = arquivoTmp();
    const a = abrir(arquivo);
    const b = abrir(arquivo);
    a.salvar({ escopo: 'proj-a', chave: 'x', valor: 'um' });
    a.salvar({ escopo: 'proj-a', chave: 'x', valor: 'dois' });
    a.salvar({ escopo: 'proj-a', chave: 'y', valor: 'tres' });
    assert.equal(b.buscar({ escopo: 'proj-a' }).total, 2);
    a.compactar();
    assert.deepEqual(b.buscar({ escopo: 'proj-a' }).itens.map((i) => i.valor).sort(), ['dois', 'tres']);
    b.esquecer({ escopo: 'proj-a', chave: 'y' });
    assert.equal(a.buscar({ escopo: 'proj-a' }).total, 1);
  });

  it('arquivo reescrito no mesmo lugar e menor que antes (mesmo inode): a instância recarrega do zero', () => {
    const arquivo = arquivoTmp();
    const a = abrir(arquivo);
    for (const chave of ['um', 'dois', 'tres']) a.salvar({ escopo: 'proj-a', chave, valor: `valor ${chave}` });
    assert.equal(a.buscar({ escopo: 'proj-a' }).total, 3);
    fs.writeFileSync(arquivo, `${evento({ chave: 'novo', valor: 'so este' })}\n`); // sobrescreve sem trocar o arquivo
    assert.deepEqual(a.buscar({ escopo: 'proj-a' }).itens.map((i) => i.chave), ['novo']);
  });

  it('com a trava presente, gravar e compactar falham com mensagem clara; remover a trava libera', () => {
    const arquivo = arquivoTmp();
    const m = abrir(arquivo);
    fs.writeFileSync(`${arquivo}.lock`, '');
    erroCom(() => m.salvar({ escopo: 'proj-a', chave: 'a', valor: 'x' }), 'arquivo_em_manutencao');
    erroCom(() => m.compactar(), 'arquivo_em_manutencao');
    assert.ok(fs.existsSync(`${arquivo}.lock`), 'não apaga a trava de outro processo');
    fs.rmSync(`${arquivo}.lock`);
    assert.ok(m.salvar({ escopo: 'proj-a', chave: 'a', valor: 'x' }).id);
  });
});

describe('arquivo danificado ou editado à mão', () => {
  it('recusa registros com formato inválido, apontando a linha (inclusive depois de linhas em branco)', () => {
    const casos = [
      ['[]', 'array'],
      ['null', 'null'],
      [JSON.stringify({ op: 'apagar-tudo', escopo: 'proj-a', chave: 'k' }), 'operação desconhecida'],
      [JSON.stringify({ op: 'salvar', escopo: 'Proj A', chave: 'k', valor: 'v' }), 'escopo inválido'],
      [JSON.stringify({ op: 'salvar', escopo: 'proj-a', chave: 'K!', valor: 'v' }), 'chave inválida'],
      [JSON.stringify({ op: 'salvar', escopo: 'proj-a', chave: 'k', valor: 42 }), 'valor numérico'],
      [JSON.stringify({ op: 'salvar', chave: 'k', valor: 'v' }), 'sem escopo'],
    ];
    for (const [linha, rotulo] of casos) {
      const arquivo = arquivoTmp();
      fs.writeFileSync(arquivo, `${evento()}\n\n${linha}\n`);
      assert.throws(() => abrir(arquivo), (e) => e.codigo === 'arquivo_corrompido' && /linha 3/.test(e.message), rotulo);
    }
  });

  it('aceita BOM no início e quebras de linha CRLF', () => {
    const arquivo = arquivoTmp();
    fs.writeFileSync(arquivo, `${String.fromCharCode(0xfeff)}${evento({ chave: 'a' })}\r\n${evento({ chave: 'b' })}\r\n`);
    assert.equal(abrir(arquivo).buscar({ escopo: 'proj-a' }).total, 2);
  });

  it('arquivo acima do limite exige compactar() em vez de carregar tudo', () => {
    const arquivo = arquivoTmp();
    fs.writeFileSync(arquivo, '');
    fs.truncateSync(arquivo, LIMITES.arquivoMaxBytes + 1);
    assert.throws(() => abrir(arquivo), (e) => e.codigo === 'arquivo_grande');
  });

  it('segredo que entrou por edição manual é mascarado na busca', () => {
    const arquivo = arquivoTmp();
    const falso = `sk-${'Qw7z'.repeat(8)}`;
    fs.writeFileSync(arquivo, `${evento({ valor: `usar a chave ${falso} no deploy` })}\n`);
    const r = abrir(arquivo).buscar({ escopo: 'proj-a' });
    assert.ok(!JSON.stringify(r).includes('Qw7z'));
    assert.ok(r.itens[0].valor.includes('***'));
  });
});

describe('texto que engana quem lê', () => {
  it('recusa controles, escape ANSI, bidi e caracteres invisíveis no valor e na fonte', () => {
    const m = abrir(arquivoTmp());
    for (const c of [0x1b, 0x202e, 0x200b, 0x9b, 0xfeff, 0x07]) {
      erroCom(() => m.salvar({ escopo: 'proj-a', chave: 'k', valor: `oi${String.fromCharCode(c)}tchau` }), 'valor_invalido');
      erroCom(() => m.salvar({ escopo: 'proj-a', chave: 'k', valor: 'ok', fonte: `a${String.fromCharCode(c)}b` }), 'fonte_invalida');
    }
    assert.ok(m.salvar({ escopo: 'proj-a', chave: 'k', valor: 'linha 1\nlinha 2\ttab, acentuação e emoji 🙂' }).id, 'quebra de linha, tabulação e Unicode normal passam');
  });

  it('recusa segredo na fonte', () => {
    const m = abrir(arquivoTmp());
    erroCom(() => m.salvar({ escopo: 'proj-a', chave: 'k', valor: 'ok', fonte: `ghp_${'a1B2'.repeat(6)}` }), 'fonte_invalida');
  });
});

describe('validações restantes', () => {
  it('consulta deve ser texto curto; chave de esquecer é validada como a de salvar', () => {
    const m = abrir(arquivoTmp());
    erroCom(() => m.buscar({ escopo: 'proj-a', consulta: 42 }), 'consulta_invalida');
    erroCom(() => m.buscar({ escopo: 'proj-a', consulta: { toString: () => 'x' } }), 'consulta_invalida');
    erroCom(() => m.buscar({ escopo: 'proj-a', consulta: 'x'.repeat(LIMITES.consulta + 1) }), 'consulta_invalida');
    erroCom(() => m.esquecer({ escopo: 'proj-a', chave: 'Inválida!' }), 'chave_invalida');
  });

  it('configuração: limite do escopo e arquivo precisam fazer sentido', () => {
    for (const limite of [0, -1, 1.5, '10', NaN]) {
      assert.throws(() => abrir(arquivoTmp(), { limiteRegistrosPorEscopo: limite }), (e) => e.codigo === 'configuracao', String(limite));
    }
    assert.throws(() => criarMemoria({ arquivo: '', escoposPermitidos: ['proj-a'] }), (e) => e.codigo === 'configuracao');
    assert.throws(() => criarMemoria({ arquivo: arquivoTmp(), escoposPermitidos: [42] }), (e) => e.codigo === 'configuracao');
  });

  it('memória expirada não conta como existente: salvar de novo não "substitui" e esquecer não "remove"', () => {
    let agora = new Date('2026-10-18T00:00:00Z');
    const m = abrir(arquivoTmp(), { agora: () => agora });
    m.salvar({ escopo: 'proj-a', chave: 'temp', valor: 'v1', ttl_dias: 1 });
    agora = new Date('2026-10-20T00:00:00Z');
    assert.equal(m.esquecer({ escopo: 'proj-a', chave: 'temp' }).removida, false);
    m.salvar({ escopo: 'proj-a', chave: 'temp2', valor: 'v1', ttl_dias: 1 });
    agora = new Date('2026-10-23T00:00:00Z');
    assert.equal(m.salvar({ escopo: 'proj-a', chave: 'temp2', valor: 'v2' }).substituiu, false);
  });

  it('memória expirada não ocupa vaga no limite do escopo', () => {
    let agora = new Date('2026-10-18T00:00:00Z');
    const m = abrir(arquivoTmp(), { agora: () => agora, limiteRegistrosPorEscopo: 1 });
    m.salvar({ escopo: 'proj-a', chave: 'a', valor: '1', ttl_dias: 1 });
    erroCom(() => m.salvar({ escopo: 'proj-a', chave: 'b', valor: '2' }), 'escopo_cheio');
    agora = new Date('2026-10-20T00:00:00Z');
    assert.ok(m.salvar({ escopo: 'proj-a', chave: 'b', valor: '2' }).id);
  });
});
