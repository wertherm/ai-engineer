// Testes do núcleo da memória (sem dependências).
//   node --test academia/extensoes/memoria-persistente-mcp/referencia/memoria.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { AVISO, criarMemoria, ErroDeMemoria, LIMITES } from './memoria.mjs';

const tmps = [];
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }); });
const arquivoTmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-'));
  tmps.push(d);
  return path.join(d, 'sub', 'memoria.jsonl');
};
const nova = (extra = {}) => criarMemoria({ arquivo: arquivoTmp(), escoposPermitidos: ['proj-a', 'proj-b'], ...extra });
const erroCom = (fn, codigo) => assert.throws(fn, (e) => e instanceof ErroDeMemoria && e.codigo === codigo, `esperava ${codigo}`);

describe('configuração', () => {
  it('exige uma lista de escopos válidos', () => {
    for (const ruim of [undefined, [], ['Maiúsculo'], ['com espaço'], ['ok', '../fuga']]) {
      assert.throws(() => criarMemoria({ arquivo: arquivoTmp(), escoposPermitidos: ruim }), (e) => e.codigo === 'configuracao');
    }
  });

  it('recusa um arquivo corrompido em vez de ignorar linhas', () => {
    const arquivo = arquivoTmp();
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, '{"op":"salvar","escopo":"proj-a","chave":"a","valor":"x","em":"2026-01-01T00:00:00Z"}\n{ lixo\n');
    assert.throws(() => criarMemoria({ arquivo, escoposPermitidos: ['proj-a'] }), (e) => e.codigo === 'arquivo_corrompido' && /linha 2/.test(e.message));
  });
});

describe('salvar e buscar', () => {
  it('guarda, busca por palavra-chave sem diferenciar acento nem caixa e persiste entre execuções', () => {
    const arquivo = arquivoTmp();
    const m = criarMemoria({ arquivo, escoposPermitidos: ['proj-a'] });
    m.salvar({ escopo: 'proj-a', chave: 'decisao.banco', tipo: 'decisao', valor: 'Usar PostgreSQL pela consistência transacional (ACID).' });
    m.salvar({ escopo: 'proj-a', chave: 'bug.login', tipo: 'bug', valor: 'Login aceita e-mail inválido; faltava validação.' });
    const r = m.buscar({ escopo: 'proj-a', consulta: 'CONSISTENCIA postgresql' });
    assert.equal(r.aviso, AVISO);
    assert.deepEqual(r.itens.map((i) => i.chave), ['decisao.banco']);
    const reaberta = criarMemoria({ arquivo, escoposPermitidos: ['proj-a'] });
    assert.equal(reaberta.buscar({ escopo: 'proj-a' }).total, 2);
  });

  it('a mesma chave substitui o valor (upsert), mas o histórico fica no arquivo', () => {
    const arquivo = arquivoTmp();
    const m = criarMemoria({ arquivo, escoposPermitidos: ['proj-a'] });
    assert.equal(m.salvar({ escopo: 'proj-a', chave: 'c', valor: 'um' }).substituiu, false);
    assert.equal(m.salvar({ escopo: 'proj-a', chave: 'c', valor: 'dois' }).substituiu, true);
    assert.deepEqual(m.buscar({ escopo: 'proj-a' }).itens.map((i) => i.valor), ['dois']);
    const linhas = fs.readFileSync(arquivo, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(linhas.map((l) => l.valor), ['um', 'dois'], 'auditoria: nada é apagado do arquivo');
  });

  it('ordena por relevância e depois por recência, filtra por tipo e respeita o limite', () => {
    let t = Date.parse('2026-10-18T10:00:00Z');
    const m = nova({ agora: () => new Date((t += 1000)) });
    m.salvar({ escopo: 'proj-a', chave: 'a', tipo: 'nota', valor: 'api rest autenticação' });
    m.salvar({ escopo: 'proj-a', chave: 'b', tipo: 'padrao', valor: 'api rest autenticação jwt refresh' });
    m.salvar({ escopo: 'proj-a', chave: 'c', tipo: 'nota', valor: 'outra coisa' });
    assert.deepEqual(m.buscar({ escopo: 'proj-a', consulta: 'api autenticacao jwt' }).itens.map((i) => i.chave), ['b', 'a']);
    assert.deepEqual(m.buscar({ escopo: 'proj-a' }).itens.map((i) => i.chave), ['c', 'b', 'a'], 'sem consulta: mais recentes primeiro');
    assert.deepEqual(m.buscar({ escopo: 'proj-a', tipo: 'padrao' }).itens.map((i) => i.chave), ['b']);
    const limitado = m.buscar({ escopo: 'proj-a', limite: 2 });
    assert.equal(limitado.itens.length, 2);
    assert.equal(limitado.total, 3, 'total informa que há mais do que veio');
  });

  it('não devolve a memória inteira: o limite máximo é imposto', () => {
    const m = nova();
    erroCom(() => m.buscar({ escopo: 'proj-a', limite: LIMITES.resultadosMax + 1 }), 'limite_invalido');
    erroCom(() => m.buscar({ escopo: 'proj-a', limite: 0 }), 'limite_invalido');
    erroCom(() => m.buscar({ escopo: 'proj-a', limite: 1.5 }), 'limite_invalido');
    erroCom(() => m.buscar({ escopo: 'proj-a', tipo: 'inexistente' }), 'tipo_invalido');
  });
});

describe('escopo e isolamento', () => {
  it('um escopo não enxerga o outro e escopos não liberados são negados', () => {
    const m = nova();
    m.salvar({ escopo: 'proj-a', chave: 'seg', valor: 'dado do A' });
    assert.equal(m.buscar({ escopo: 'proj-b' }).total, 0);
    erroCom(() => m.buscar({ escopo: 'proj-c' }), 'escopo_negado');
    erroCom(() => m.salvar({ escopo: 'proj-c', chave: 'x', valor: 'y' }), 'escopo_negado');
    erroCom(() => m.esquecer({ escopo: 'proj-c', chave: 'x' }), 'escopo_negado');
    erroCom(() => m.buscar({ escopo: '../proj-a' }), 'escopo_invalido');
    erroCom(() => m.buscar({}), 'escopo_invalido');
    assert.equal(m.esquecer({ escopo: 'proj-b', chave: 'seg' }).removida, false, 'esquecer em outro escopo não apaga o do A');
    assert.equal(m.buscar({ escopo: 'proj-a' }).total, 1);
  });

  it('o mesmo nome de chave pode existir em escopos diferentes', () => {
    const m = nova();
    m.salvar({ escopo: 'proj-a', chave: 'k', valor: 'a' });
    m.salvar({ escopo: 'proj-b', chave: 'k', valor: 'b' });
    assert.deepEqual(m.buscar({ escopo: 'proj-a' }).itens.map((i) => i.valor), ['a']);
    assert.deepEqual(m.buscar({ escopo: 'proj-b' }).itens.map((i) => i.valor), ['b']);
  });
});

describe('validação e política de segredos', () => {
  it('valida chave, tipo, valor, tamanho e TTL', () => {
    const m = nova();
    const base = { escopo: 'proj-a', chave: 'ok', valor: 'valor' };
    erroCom(() => m.salvar({ ...base, chave: 'Com Espaço' }), 'chave_invalida');
    erroCom(() => m.salvar({ ...base, chave: undefined }), 'chave_invalida');
    erroCom(() => m.salvar({ ...base, tipo: 'credencial' }), 'tipo_invalido');
    erroCom(() => m.salvar({ ...base, valor: '   ' }), 'valor_invalido');
    erroCom(() => m.salvar({ ...base, valor: 42 }), 'valor_invalido');
    erroCom(() => m.salvar({ ...base, valor: 'a\u0000b' }), 'valor_invalido');
    erroCom(() => m.salvar({ ...base, valor: 'x'.repeat(LIMITES.valor + 1) }), 'valor_grande');
    erroCom(() => m.salvar({ ...base, ttl_dias: 0 }), 'ttl_invalido');
    erroCom(() => m.salvar({ ...base, ttl_dias: 1.5 }), 'ttl_invalido');
    assert.ok(m.salvar({ ...base, valor: 'x'.repeat(LIMITES.valor) }).id);
  });

  it('recusa credenciais sem repetir o valor na mensagem e sem gravar nada', () => {
    const arquivo = arquivoTmp();
    const m = criarMemoria({ arquivo, escoposPermitidos: ['proj-a'] });
    const segredos = [
      'a chave é sk-' + 'Zq9x'.repeat(6),
      'Authorization: Bearer ' + 'abcdefgh12345678abcd',
      'conectar em https://' + 'usuario' + ':' + 'senhaforte' + '@host.exemplo/db',
      'ghp_' + 'A1b2'.repeat(6),
    ];
    for (const valor of segredos) {
      try {
        m.salvar({ escopo: 'proj-a', chave: 'cred', valor });
        assert.fail('deveria recusar');
      } catch (e) {
        assert.equal(e.codigo, 'segredo_recusado');
        assert.ok(!e.message.includes('senhaforte') && !e.message.includes('Zq9x') && !e.message.includes('abcdefgh'));
      }
    }
    assert.ok(!fs.existsSync(arquivo) || fs.readFileSync(arquivo, 'utf8') === '', 'nada foi gravado');
    assert.ok(m.salvar({ escopo: 'proj-a', chave: 'ok', valor: 'risk-assessment-framework é só um nome' }).id, 'sem falso positivo');
  });

  it('impõe o limite de registros por escopo (mas permite atualizar os existentes)', () => {
    const m = nova({ limiteRegistrosPorEscopo: 2 });
    m.salvar({ escopo: 'proj-a', chave: 'a', valor: '1' });
    m.salvar({ escopo: 'proj-a', chave: 'b', valor: '2' });
    erroCom(() => m.salvar({ escopo: 'proj-a', chave: 'c', valor: '3' }), 'escopo_cheio');
    assert.equal(m.salvar({ escopo: 'proj-a', chave: 'a', valor: 'novo' }).substituiu, true);
    assert.ok(m.salvar({ escopo: 'proj-b', chave: 'c', valor: '3' }).id, 'o limite é por escopo');
  });
});

describe('expiração e esquecimento', () => {
  it('memórias com TTL somem depois do prazo (relógio injetado)', () => {
    let agora = new Date('2026-10-18T00:00:00Z');
    const m = nova({ agora: () => agora });
    m.salvar({ escopo: 'proj-a', chave: 'temp', valor: 'vale 2 dias', ttl_dias: 2 });
    m.salvar({ escopo: 'proj-a', chave: 'perm', valor: 'vale sempre' });
    assert.equal(m.buscar({ escopo: 'proj-a' }).total, 2);
    agora = new Date('2026-10-21T00:00:00Z');
    assert.deepEqual(m.buscar({ escopo: 'proj-a' }).itens.map((i) => i.chave), ['perm']);
  });

  it('esquecer remove da busca, sobrevive à reabertura e deixa rastro no arquivo', () => {
    const arquivo = arquivoTmp();
    const m = criarMemoria({ arquivo, escoposPermitidos: ['proj-a'] });
    m.salvar({ escopo: 'proj-a', chave: 'x', valor: 'apagar' });
    assert.equal(m.esquecer({ escopo: 'proj-a', chave: 'x' }).removida, true);
    assert.equal(m.esquecer({ escopo: 'proj-a', chave: 'x' }).removida, false);
    assert.equal(criarMemoria({ arquivo, escoposPermitidos: ['proj-a'] }).buscar({ escopo: 'proj-a' }).total, 0);
    const ops = fs.readFileSync(arquivo, 'utf8').trim().split('\n').map((l) => JSON.parse(l).op);
    assert.deepEqual(ops, ['salvar', 'esquecer']);
  });
});
