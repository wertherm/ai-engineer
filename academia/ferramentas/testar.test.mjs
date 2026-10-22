// Testes do executor de testes (testar.mjs) e da regra "lento fica fora do comando rápido".
//   node --test academia/ferramentas/testar.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { GLOB_LENTOS, GLOB_RAPIDOS, RAIZ, SUFIXO_LENTO, globsDoModo, lerModo } from './testar.mjs';

function listar(dir, achados = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '.git') continue;
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) listar(caminho, achados);
    else achados.push(caminho);
  }
  return achados;
}

describe('testar.mjs: modos', () => {
  it('sem opção roda só os rápidos', () => {
    assert.equal(lerModo([]), 'rapidos');
    assert.deepEqual(globsDoModo('rapidos'), [GLOB_RAPIDOS]);
  });
  it('--lentos roda só os lentos e --tudo roda os dois grupos', () => {
    assert.equal(lerModo(['--lentos']), 'lentos');
    assert.deepEqual(globsDoModo('lentos'), [GLOB_LENTOS]);
    assert.deepEqual(globsDoModo('tudo'), [GLOB_RAPIDOS, GLOB_LENTOS]);
  });
  it('o padrão rápido nunca casa com um arquivo lento (a regra que mantém o comando de sempre rápido)', () => {
    assert.ok(GLOB_RAPIDOS.endsWith('.test.mjs'));
    assert.ok(GLOB_LENTOS.endsWith(SUFIXO_LENTO));
    assert.ok(!`x${SUFIXO_LENTO}`.endsWith('.test.mjs'), 'um arquivo .lento.mjs não pode terminar em .test.mjs');
  });
  it('opção desconhecida ou modos misturados são erro (um erro de digitação não roda o grupo errado em silêncio)', () => {
    assert.throws(() => lerModo(['--lento']), /opção desconhecida/);
    assert.throws(() => lerModo(['--lentos', '--rapidos']), /só um modo/);
    assert.throws(() => globsDoModo('qualquer'), /modo desconhecido/);
  });
});

describe('arquivos lentos do repositório', () => {
  const lentos = listar(path.join(RAIZ, 'academia')).filter((f) => f.endsWith(SUFIXO_LENTO));

  it('existe pelo menos um (a Lição 2); se este teste falhar, o grupo lento sumiu ou foi renomeado', () => {
    assert.ok(lentos.some((f) => f.includes('02-apis-erros-e-integracao')), lentos.join(', '));
  });
  it('cada um explica no cabeçalho como rodar e por que é lento (quem abrir o arquivo sabe o que fazer)', () => {
    for (const f of lentos) {
      const topo = readFileSync(f, 'utf8').split('\n').slice(0, 14).join('\n');
      assert.match(topo, /LENTO/, `${path.relative(RAIZ, f)}: falta o aviso LENTO no cabeçalho`);
      assert.match(topo, /testar\.mjs --lentos/, `${path.relative(RAIZ, f)}: falta o comando no cabeçalho`);
    }
  });
});
