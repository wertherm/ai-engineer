// Testes das ferramentas de projeto (usam um repositório Git temporário).
//   node --test academia/extensoes/time-de-agentes/referencia/ferramentas-do-projeto.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { criarRegistro } from '../../harness-de-agentes/referencia/registro-de-ferramentas.mjs';
import { criarFerramentasDoProjeto } from './ferramentas-do-projeto.mjs';

const tmps = [];
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }); });

function projeto() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
  tmps.push(d);
  const git = (...a) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 't@t.t'); git('config', 'user.name', 'Teste'); git('config', 'commit.gpgsign', 'false');
  fs.mkdirSync(path.join(d, 'src'));
  fs.mkdirSync(path.join(d, 'node_modules'));
  fs.writeFileSync(path.join(d, 'src', 'a.js'), 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n');
  fs.writeFileSync(path.join(d, '.env'), 'TOKEN=segredo\n');
  fs.writeFileSync(path.join(d, 'node_modules', 'x.js'), 'x');
  git('add', 'src/a.js'); git('commit', '-q', '-m', 'inicial');
  return d;
}
const porNome = (ferramentas, nome) => ferramentas.find((f) => f.nome === nome);
const registro = (ferramentas, extra = {}) => { const r = criarRegistro({ permissoes: ['leitura', 'escrita'], ...extra }); ferramentas.forEach((f) => r.registrar(f)); return r; };

describe('contrato', () => {
  it('as ferramentas respeitam o contrato do registro (esquema fechado, risco declarado) e só rodar_testes é de escrita', () => {
    const f = criarFerramentasDoProjeto({ raiz: projeto(), comandoTestes: [process.execPath, '-e', '0'] });
    assert.deepEqual(f.map((x) => [x.nome, x.risco]), [['ler_arquivo', 'leitura'], ['listar_arquivos', 'leitura'], ['git_diff', 'leitura'], ['rodar_testes', 'escrita']]);
    assert.doesNotThrow(() => registro(f));
    assert.equal(criarFerramentasDoProjeto({ raiz: projeto() }).length, 3, 'sem comando de testes configurado não existe rodar_testes');
  });

  it('configuração inválida é recusada', () => {
    assert.throws(() => criarFerramentasDoProjeto({ raiz: '/nao/existe/mesmo' }), /raiz do projeto inexistente/);
    assert.throws(() => criarFerramentasDoProjeto({ raiz: projeto(), comandoTestes: 'npm test' }), /lista/);
  });
});

describe('ler_arquivo', () => {
  it('lê com números de linha, aceita intervalo e devolve o caminho relativo', async () => {
    const f = porNome(criarFerramentasDoProjeto({ raiz: projeto() }), 'ler_arquivo');
    const r = await f.executar({ caminho: 'src/a.js', inicio: 2, fim: 3 });
    assert.equal(r.arquivo, 'src/a.js');
    assert.equal(r.conteudo, 'L2: export const b = 2;\nL3: export const c = 3;');
    assert.equal(r.linhas, '2-3 de 4');
  });

  it('recusa caminhos fora do projeto, absolutos, com .. e arquivos sensíveis', async () => {
    const raiz = projeto();
    const f = porNome(criarFerramentasDoProjeto({ raiz }), 'ler_arquivo');
    for (const caminho of ['../fora.txt', 'src/../../fora.txt', '/etc/passwd', 'C:\\Windows\\win.ini', '.env', '.git/config', 'node_modules/x.js', 'chaves/id_rsa', 'a\0b']) {
      await assert.rejects(f.executar({ caminho }), /caminho inválido|acesso negado|não encontrado/, caminho);
    }
  });

  it('não escapa por symlink/junction que aponta para fora', async () => {
    const raiz = projeto();
    const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'fora-'));
    tmps.push(fora);
    fs.writeFileSync(path.join(fora, 'segredo.txt'), 'nao deveria ler');
    fs.symlinkSync(fora, path.join(raiz, 'atalho'), 'junction');
    const f = porNome(criarFerramentasDoProjeto({ raiz }), 'ler_arquivo');
    await assert.rejects(f.executar({ caminho: 'atalho/segredo.txt' }), /fora do projeto/);
  });

  it('mascara segredos que estejam no arquivo, trunca arquivos grandes e recusa binários e pastas', async () => {
    const raiz = projeto();
    fs.writeFileSync(path.join(raiz, 'cfg.js'), `const k = "sk-${'Zq9x'.repeat(6)}";\n${'x'.repeat(500)}\n`);
    fs.writeFileSync(path.join(raiz, 'bin.dat'), Buffer.from([1, 2, 0, 3]));
    const f = porNome(criarFerramentasDoProjeto({ raiz, limiteArquivo: 100 }), 'ler_arquivo');
    const r = await f.executar({ caminho: 'cfg.js' });
    assert.ok(!r.conteudo.includes('Zq9x') && r.conteudo.includes('***'));
    assert.equal(r.truncado, true);
    assert.ok(r.conteudo.length <= 100);
    await assert.rejects(f.executar({ caminho: 'bin.dat' }), /binário/);
    await assert.rejects(f.executar({ caminho: 'src' }), /não é um arquivo/);
    await assert.rejects(f.executar({ caminho: 'src/a.js', inicio: 50 }), /intervalo/);
  });
});

describe('listar_arquivos', () => {
  it('lista sem .git, node_modules e .env, respeita a profundidade e o limite', async () => {
    const raiz = projeto();
    fs.mkdirSync(path.join(raiz, 'src', 'fundo', 'mais'), { recursive: true });
    fs.writeFileSync(path.join(raiz, 'src', 'fundo', 'mais', 'z.js'), '');
    const f = porNome(criarFerramentasDoProjeto({ raiz }), 'listar_arquivos');
    const r = await f.executar({});
    assert.deepEqual(r.itens, ['src/', 'src/a.js', 'src/fundo/']);
    assert.ok(!r.itens.some((i) => /\.git|node_modules|\.env/.test(i)));
    const fundo = await f.executar({ profundidade: 4 });
    assert.ok(fundo.itens.includes('src/fundo/mais/z.js'));
    const curto = await porNome(criarFerramentasDoProjeto({ raiz, listaMax: 1 }), 'listar_arquivos').executar({});
    assert.deepEqual([curto.itens.length, curto.cortado], [1, true]);
    await assert.rejects(f.executar({ pasta: '../' }), /caminho inválido/);
  });
});

describe('git_diff', () => {
  it('mostra a mudança não commitada, a staged e contra uma referência; vazio quando não há mudança', async () => {
    const raiz = projeto();
    const f = porNome(criarFerramentasDoProjeto({ raiz }), 'git_diff');
    assert.equal((await f.executar({})).vazio, true);
    fs.appendFileSync(path.join(raiz, 'src', 'a.js'), 'export const d = 4;\n');
    const r = await f.executar({});
    assert.equal(r.vazio, false);
    assert.match(r.diff, /\+export const d = 4;/);
    assert.equal((await f.executar({ apenas_staged: true })).vazio, true);
    execFileSync('git', ['add', '-A'], { cwd: raiz });
    assert.equal((await f.executar({ apenas_staged: true })).vazio, false);
    assert.match((await f.executar({ referencia: 'HEAD' })).diff, /export const d = 4/);
  });

  it('recusa referências que seriam opções ou injeção e informa erro do git sem vazar o ambiente', async () => {
    const f = porNome(criarFerramentasDoProjeto({ raiz: projeto() }), 'git_diff');
    for (const referencia of ['--output=/tmp/x', '-p', 'a b', 'main;rm -rf', '$(id)', '`id`', '']) {
      await assert.rejects(f.executar({ referencia }), /referência inválida/, referencia);
    }
    await assert.rejects(f.executar({ referencia: 'branch-que-nao-existe' }), /git diff falhou/);
  });

  it('mascara segredos que apareçam no diff', async () => {
    const raiz = projeto();
    fs.appendFileSync(path.join(raiz, 'src', 'a.js'), `const k = "sk-${'Hh7k'.repeat(6)}";\n`);
    const r = await porNome(criarFerramentasDoProjeto({ raiz }), 'git_diff').executar({});
    assert.ok(!r.diff.includes('Hh7k'));
  });
});

describe('endurecimento adicional', () => {
  it('nomes sensíveis são negados sem diferenciar maiúsculas (Windows e macOS são insensíveis)', async () => {
    const raiz = projeto();
    const f = porNome(criarFerramentasDoProjeto({ raiz }), 'ler_arquivo');
    for (const caminho of ['.GIT/config', 'Node_Modules/x.js', '.ENV', '.Env.Local', 'chaves/ID_RSA', 'dir/Credentials.JSON', 'CERT.PEM']) {
      await assert.rejects(f.executar({ caminho }), /caminho inválido|acesso negado|não encontrado/, caminho);
    }
    const lista = await porNome(criarFerramentasDoProjeto({ raiz }), 'listar_arquivos').executar({});
    assert.ok(!lista.itens.some((i) => /\.git|node_modules|\.env/i.test(i)));
  });

  it('arquivo acima de 2 MB não é lido por inteiro', async () => {
    const raiz = projeto();
    fs.writeFileSync(path.join(raiz, 'grande.txt'), 'x'.repeat(2_000_001));
    await assert.rejects(porNome(criarFerramentasDoProjeto({ raiz }), 'ler_arquivo').executar({ caminho: 'grande.txt' }), /grande demais/);
  });

  it('o diff não mostra o conteúdo de arquivos sensíveis que estejam versionados', async () => {
    const raiz = projeto();
    const git = (...a) => execFileSync('git', a, { cwd: raiz, stdio: 'pipe' });
    fs.writeFileSync(path.join(raiz, 'secrets.json'), '{"chave":"valor-antigo"}\n');
    git('add', 'secrets.json'); git('commit', '-q', '-m', 'segredos versionados por engano');
    fs.writeFileSync(path.join(raiz, 'secrets.json'), '{"chave":"valor-novo-super-secreto"}\n');
    fs.appendFileSync(path.join(raiz, 'src', 'a.js'), 'export const visivel = 1;\n');
    const r = await porNome(criarFerramentasDoProjeto({ raiz }), 'git_diff').executar({});
    assert.ok(!r.diff.includes('valor-novo-super-secreto') && !r.diff.includes('valor-antigo'));
    assert.match(r.diff, /diff --git a\/secrets\.json b\/secrets\.json\n\[conteúdo omitido/);
    assert.match(r.diff, /\+export const visivel = 1;/, 'o resto do diff continua');
  });

  // Controle experimental: o teste só vale se o `git diff` "cru" realmente executa o comando do repositório neste ambiente.
  for (const caso of [
    { nome: 'core.fsmonitor', preparar: (raiz, cmd) => execFileSync('git', ['config', 'core.fsmonitor', cmd], { cwd: raiz }) },
    {
      nome: 'diff.<driver>.textconv',
      preparar: (raiz, cmd) => {
        fs.writeFileSync(path.join(raiz, '.gitattributes'), '*.js diff=evil\n');
        execFileSync('git', ['config', 'diff.evil.textconv', cmd], { cwd: raiz });
      },
    },
  ]) {
    it(`um repositório que configura ${caso.nome} não consegue executar comandos através do git_diff`, async (t) => {
      const raiz = projeto();
      const marcador = path.join(os.tmpdir(), `marcador-${process.pid}-${Date.now()}-${caso.nome.replace(/\W/g, '')}`);
      tmps.push(marcador);
      const script = path.join(os.tmpdir(), `executa-${process.pid}-${Date.now()}-${caso.nome.replace(/\W/g, '')}.mjs`);
      tmps.push(script);
      fs.writeFileSync(script, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marcador)}, 'executou'); process.stdout.write(fs.existsSync(process.argv[2] ?? '') ? fs.readFileSync(process.argv[2]) : '');\n`);
      const cmd = `"${process.execPath.replace(/\\/g, '/')}" "${script.replace(/\\/g, '/')}"`;
      caso.preparar(raiz, cmd);
      fs.appendFileSync(path.join(raiz, 'src', 'a.js'), 'export const mudou = 1;\n');
      try { execFileSync('git', ['diff'], { cwd: raiz, stdio: 'pipe' }); } catch { /* o comando do repositório pode falhar: só importa se rodou */ }
      if (!fs.existsSync(marcador)) { t.skip(`neste ambiente o git cru não executa ${caso.nome}; sem controle positivo o teste não prova nada`); return; }
      fs.rmSync(marcador, { force: true });
      const r = await porNome(criarFerramentasDoProjeto({ raiz }), 'git_diff').executar({});
      assert.ok(!fs.existsSync(marcador), `${caso.nome} foi executado pelo git_diff`);
      assert.match(r.diff, /\+export const mudou = 1;/);
    });
  }
});

describe('rodar_testes', () => {
  it('roda SÓ o comando configurado, informa código e saída, e sem chaves de API no ambiente', async () => {
    process.env.OPENAI_API_KEY_TESTE_TIME = 'nao-deve-vazar';
    try {
      const comando = [process.execPath, '-e', "console.log('rodou', process.env.OPENAI_API_KEY_TESTE_TIME ?? 'sem-chave', process.env.CI); console.error('aviso'); process.exit(3)"];
      const f = porNome(criarFerramentasDoProjeto({ raiz: projeto(), comandoTestes: comando }), 'rodar_testes');
      const r = await f.executar({});
      assert.equal(r.codigo, 3);
      assert.equal(r.passou, false);
      assert.match(r.saida_final, /rodou sem-chave 1/);
      assert.match(r.saida_final, /aviso/);
      assert.ok(!JSON.stringify(r).includes('nao-deve-vazar'));
    } finally { delete process.env.OPENAI_API_KEY_TESTE_TIME; }
  });

  it('passa quando o código é 0; estoura o tempo com mensagem; exige permissão de escrita no registro', async () => {
    const ok = criarFerramentasDoProjeto({ raiz: projeto(), comandoTestes: [process.execPath, '-e', "console.log('ok')"] });
    const r = registro(ok);
    const res = await r.executar('rodar_testes', {});
    assert.equal(res.ok, true);
    assert.equal(JSON.parse(res.resultado).passou, true);
    const lento = criarFerramentasDoProjeto({ raiz: projeto(), comandoTestes: [process.execPath, '-e', 'setTimeout(()=>{}, 60000)'], timeoutMs: 100 });
    const rl = await porNome(lento, 'rodar_testes').executar({});
    assert.deepEqual([rl.estourouTempo, rl.passou], [true, false]);
    const somenteLeitura = criarRegistro({ permissoes: ['leitura'] });
    ok.forEach((f) => somenteLeitura.registrar(f));
    assert.equal((await somenteLeitura.executar('rodar_testes', {})).erro.codigo, 'sem_permissao');
    assert.equal((await somenteLeitura.executar('listar_arquivos', {})).ok, true);
  });

  it('argumentos do modelo não alteram o comando (esquema fechado)', async () => {
    const r = registro(criarFerramentasDoProjeto({ raiz: projeto(), comandoTestes: [process.execPath, '-e', "console.log('ok')"] }));
    const res = await r.executar('rodar_testes', { comando: 'rm -rf /' });
    assert.equal(res.erro.codigo, 'argumentos_invalidos');
  });
});
