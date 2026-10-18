// Testes da infraestrutura da Lição 1 (não do modelo): a solução de referência e o verificador funcionam juntos.
// Um servidor falso, compatível com a API de chat, faz o papel do LLM. Ele conta "tokens" de um jeito simples e
// determinístico (4 caracteres por token + custo fixo por mensagem), então NÃO substitui rodar com um LLM real.
//
//   node --test academia/licoes/01-tokens-contexto-inferencia/licao.test.mjs
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { verificar } from './verificar.mjs';

const exec = promisify(execFile);
const aqui = path.dirname(fileURLToPath(import.meta.url));

const tokensDe = (messages) =>
  3 + messages.reduce((soma, m) => soma + 3 + Math.ceil(String(m.content).length / 4), 0);

function responder(corpo) {
  const { messages } = corpo;
  const limite = corpo.max_tokens ?? corpo.max_completion_tokens ?? 1024;
  const ultima = String(messages.at(-1).content);
  const historico = messages.map((m) => m.content).join('\n');
  let texto;
  if (/Qual é o meu codinome/.test(ultima)) texto = /Zephyrus-42/.test(historico) ? 'Zephyrus-42' : 'Não sei.';
  else if (/40 dicas|três parágrafos/.test(ultima)) texto = Array.from({ length: 200 }, (_, n) => `palavra${n}`).join(' ');
  else if (/codinome é/.test(ultima)) texto = 'anotado';
  else texto = 'ok';
  const desejados = texto.split(/\s+/).length;
  const completion = Math.min(desejados, limite);
  const cortado = desejados > limite;
  const content = cortado ? texto.split(/\s+/).slice(0, completion).join(' ') : texto;
  return {
    atrasoMs: 3 + completion,
    json: {
      choices: [{ message: { role: 'assistant', content }, finish_reason: cortado ? 'length' : 'stop' }],
      usage: { prompt_tokens: tokensDe(messages), completion_tokens: completion, total_tokens: tokensDe(messages) + completion },
    },
  };
}

let servidor;
let baseURL;
let pasta;
const requisicoes = [];

const PARAGRAFO = 'Texto de teste com conteúdo suficiente para ocupar a seção do relatório do aluno. ';
const RELATORIO_MD = `# Relatório\n\n## Resultados\n\n${PARAGRAFO.repeat(8)}\n\n## Explicação\n\n${PARAGRAFO.repeat(16)}\n\n## Surpresas e limites\n\n${PARAGRAFO.repeat(8)}\n`;

before(async () => {
  servidor = createServer((req, res) => {
    let dados = '';
    req.on('data', (c) => (dados += c));
    req.on('end', () => {
      const corpo = JSON.parse(dados);
      requisicoes.push({ corpo, autorizacao: req.headers.authorization });
      const { atrasoMs, json } = responder(corpo);
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
      }, atrasoMs);
    });
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  baseURL = `http://127.0.0.1:${servidor.address().port}/v1`;
  pasta = await mkdtemp(path.join(tmpdir(), 'licao01-'));
  await exec(process.execPath, [path.join(aqui, 'referencia', 'medir.mjs'), pasta], {
    env: { ...process.env, OPENAI_BASE_URL: baseURL, OPENAI_API_KEY: 'chave-de-teste' },
  });
  await copyFile(path.join(aqui, 'referencia', 'medir.mjs'), path.join(pasta, 'medir.mjs'));
  await writeFile(path.join(pasta, 'relatorio.md'), RELATORIO_MD);
});

after(async () => {
  servidor.close();
  await rm(pasta, { recursive: true, force: true });
});

const lerRelatorio = async () => JSON.parse(await readFile(path.join(pasta, 'relatorio.json'), 'utf8'));

/** Copia a entrega, aplica a alteração (no objeto do relatório e/ou nos textos) e verifica. */
async function comAlteracao(alterar, nome, { md = RELATORIO_MD, semMedir = false, jsonBruto, medirNome = 'medir.mjs', extras = {} } = {}) {
  const copia = await mkdtemp(path.join(tmpdir(), `licao01-${nome}-`));
  const r = await lerRelatorio();
  const alterado = alterar ? alterar(r) : undefined;
  await writeFile(path.join(copia, 'relatorio.json'), jsonBruto ?? JSON.stringify(alterado ?? r));
  if (md !== null) await writeFile(path.join(copia, 'relatorio.md'), md);
  if (!semMedir) await copyFile(path.join(aqui, 'referencia', 'medir.mjs'), path.join(copia, medirNome));
  for (const [arq, conteudo] of Object.entries(extras)) await writeFile(path.join(copia, arq), conteudo);
  try {
    return await verificar(copia);
  } finally {
    await rm(copia, { recursive: true, force: true });
  }
}
const falhas = (res) => res.resultados.filter((c) => !c.ok).map((c) => c.id);
const problemas = (res, id) => res.resultados.find((c) => c.id === id).problemas.join('\n');

describe('solução de referência + verificador', () => {
  it('a solução gera um relatório que cumpre CA1–CA8', async () => {
    const res = await verificar(pasta);
    assert.deepEqual(falhas(res), [], JSON.stringify(res.resultados.filter((c) => !c.ok), null, 2));
    assert.equal(res.resultados.length, 8);
  });

  it('o relatório registra 12 chamadas, só protocolo+host+caminho e nenhuma chave de API', async () => {
    const r = await lerRelatorio();
    assert.equal(r.chamadas.length, 12);
    assert.ok(!JSON.stringify(r).includes('chave-de-teste'));
    assert.match(r.ambiente.base_url, /^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    assert.ok(requisicoes.every((q) => q.autorizacao === 'Bearer chave-de-teste'), 'a chave vai no cabeçalho, nunca no corpo');
    assert.ok(requisicoes.every((q) => q.corpo.temperature === 0));
  });

  it('TEMPERATURA=omitir não envia o campo temperature (modelos que o rejeitam)', async () => {
    const antes = requisicoes.length;
    const saida = await mkdtemp(path.join(tmpdir(), 'licao01-temp-'));
    try {
      await exec(process.execPath, [path.join(aqui, 'referencia', 'medir.mjs'), saida], {
        env: { ...process.env, OPENAI_BASE_URL: baseURL, OPENAI_API_KEY: 'k', TEMPERATURA: 'omitir', PARAM_MAX_TOKENS: 'max_completion_tokens' },
      });
    } finally {
      await rm(saida, { recursive: true, force: true });
    }
    const novas = requisicoes.slice(antes);
    assert.equal(novas.length, 12);
    assert.ok(novas.every((q) => !('temperature' in q.corpo) && 'max_completion_tokens' in q.corpo && !('max_tokens' in q.corpo)));
  });

  it('a solução não grava credenciais da URL no relatório (usuário, senha e ?chave=)', async () => {
    const saida = await mkdtemp(path.join(tmpdir(), 'licao01-url-'));
    const porta = servidor.address().port;
    try {
      await exec(process.execPath, [path.join(aqui, 'referencia', 'medir.mjs'), saida], {
        env: { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${porta}/v1?key=SEGREDOSUPERSECRETO99`, OPENAI_API_KEY: 'k' },
      }).catch(() => {}); // o servidor falso ignora a query; o que importa é o que sai no JSON, se sair
      const texto = await readFile(path.join(saida, 'relatorio.json'), 'utf8').catch(() => '');
      assert.ok(!texto.includes('SEGREDOSUPERSECRETO99'));
    } finally {
      await rm(saida, { recursive: true, force: true });
    }
  });
});

describe('o verificador não aceita relatório inventado', () => {
  it('relatório escrito à mão, sem chamar modelo nenhum, reprova (CA2, CA3 e outros)', async () => {
    const res = await comAlteracao((r) => {
      r.experimentos.idioma.chars_pt = 1;
      r.experimentos.idioma.chars_en = 1;
      r.experimentos.crescimento.chars = [10, 20, 40, 80];
      r.ambiente.modelo = 'qualquer';
      return r;
    }, 'forjado', { md: '# R\n\n## Resultados\n\nxx\n\n## Explicação\n\nxx\n\n## Surpresas e limites\n\nxx\n' });
    const f = falhas(res);
    assert.ok(f.includes('CA2') && f.includes('CA3') && f.includes('CA8'), f.join());
    assert.match(problemas(res, 'CA2'), /chars_pt deve ser 388/);
    assert.match(problemas(res, 'CA3'), /crescimento\.chars deve ser \[388, 778, 1558, 3118\]/);
  });

  it('CA2: portuguesa e inglesa não podem ser a mesma chamada; razão adulterada reprova', async () => {
    let res = await comAlteracao((r) => { r.experimentos.idioma.chamada_en = r.experimentos.idioma.chamada_pt; r.experimentos.idioma.razao_tokens_pt_en = 1; return r; }, 'ca2a');
    assert.match(problemas(res, 'CA2'), /chamadas diferentes/);
    res = await comAlteracao((r) => { r.experimentos.idioma.razao_tokens_pt_en = 9; return r; }, 'ca2b');
    assert.deepEqual(falhas(res), ['CA2']);
  });

  it('CA2/CA3/CA5/CA6: parâmetros das chamadas precisam ser os do kit', async () => {
    const res = await comAlteracao((r) => {
      for (const c of r.chamadas) c.max_tokens = 3;
      r.experimentos.truncamento.max_tokens = 3;
      return r;
    }, 'maxtok');
    for (const id of ['CA2', 'CA3', 'CA4', 'CA5', 'CA6']) assert.ok(falhas(res).includes(id), id);
    assert.match(problemas(res, 'CA2'), /max_tokens deve ser 8/);
    assert.match(problemas(res, 'CA4'), /max_tokens deve ser 5/);
  });

  it('CA3: inclinação, custo fixo e plausibilidade', async () => {
    let res = await comAlteracao((r) => { r.experimentos.crescimento.tokens_por_char_marginal = 1; return r; }, 'ca3a');
    assert.deepEqual(falhas(res), ['CA3']);
    res = await comAlteracao((r) => { r.experimentos.crescimento.overhead_fixo_tokens = 99; return r; }, 'ca3b');
    assert.deepEqual(falhas(res), ['CA3']);
    res = await comAlteracao((r) => {
      const ids = r.experimentos.crescimento.chamadas;
      ids.forEach((id, k) => { const c = r.chamadas.find((x) => x.id === id); c.prompt_tokens = 10 + k; c.total_tokens = c.prompt_tokens + c.completion_tokens; });
      return r;
    }, 'ca3c');
    assert.match(problemas(res, 'CA3'), /fora do plausível/);
    res = await comAlteracao((r) => {
      const [a, b] = r.experimentos.crescimento.chamadas;
      const ca = r.chamadas.find((x) => x.id === a); const cb = r.chamadas.find((x) => x.id === b);
      cb.prompt_tokens = ca.prompt_tokens - 1; cb.total_tokens = cb.prompt_tokens + cb.completion_tokens;
      return r;
    }, 'ca3d');
    assert.match(problemas(res, 'CA3'), /não deve diminuir/);
  });

  it('CA4 exige finish_reason "length", completion entre 1 e max_tokens', async () => {
    let res = await comAlteracao((r) => { r.chamadas.find((c) => c.id === 'trunc').finish_reason = 'stop'; return r; }, 'ca4a');
    assert.deepEqual(falhas(res), ['CA4']);
    res = await comAlteracao((r) => { const c = r.chamadas.find((x) => x.id === 'trunc'); c.completion_tokens = 9; c.total_tokens = c.prompt_tokens + 9; return r; }, 'ca4b');
    assert.deepEqual(falhas(res), ['CA4']);
  });

  it('CA5 exige que o modelo não lembre sem histórico, o fato do kit e a diferença de tokens correta', async () => {
    let res = await comAlteracao((r) => {
      r.chamadas.find((c) => c.id === 'mem-sem').resposta = 'Zephyrus-42';
      r.experimentos.sem_memoria.sem_historico_lembrou = true;
      return r;
    }, 'ca5a');
    assert.deepEqual(falhas(res), ['CA5']);
    res = await comAlteracao((r) => { r.experimentos.sem_memoria.tokens_extra_do_historico = 1; return r; }, 'ca5b');
    assert.match(problemas(res, 'CA5'), /tokens_extra_do_historico deveria ser/);
    res = await comAlteracao((r) => { r.experimentos.sem_memoria.fato = 'outro'; return r; }, 'ca5c');
    assert.match(problemas(res, 'CA5'), /fato.*Zephyrus-42/);
    res = await comAlteracao((r) => { r.experimentos.sem_memoria.com_historico_lembrou = !r.experimentos.sem_memoria.com_historico_lembrou; return r; }, 'ca5d');
    assert.match(problemas(res, 'CA5'), /com_historico_lembrou/);
  });

  it('CA6 exige mais tokens de saída na chamada longa e ms por token coerente', async () => {
    let res = await comAlteracao((r) => { r.chamadas.find((c) => c.id === 'dec-longa').completion_tokens = 1; return r; }, 'ca6a');
    assert.ok(falhas(res).includes('CA6'));
    res = await comAlteracao((r) => { r.experimentos.decodificacao.ms_por_token_saida = 12345; return r; }, 'ca6b');
    assert.deepEqual(falhas(res), ['CA6']);
  });

  it('CA7 detecta chave no JSON, no relatório do aluno e no medir.mjs', async () => {
    const chave = 'sk-' + 'a1b2c3d4'.repeat(4);
    const noJson = await comAlteracao((r) => { r.ambiente.chave = chave; return r; }, 'ca7a');
    assert.deepEqual(falhas(noJson), ['CA7']);
    const noMd = await comAlteracao(null, 'ca7b', { md: `${RELATORIO_MD}\nUsei ${'authorization: bearer ' + 'abcdefghij1234567890'}\n` });
    assert.deepEqual(falhas(noMd), ['CA7']);
    const urlNoMd = await comAlteracao(null, 'ca7c', { md: `${RELATORIO_MD}\nendpoint https://${'usuario'}:${'senha1'}@host.exemplo/v1\n` });
    assert.deepEqual(falhas(urlNoMd), ['CA7']);
    assert.ok(!JSON.stringify(urlNoMd).includes('senha1'), 'a mensagem nunca repete o segredo');
    const falsoPositivo = await comAlteracao(null, 'ca7d', { md: `${RELATORIO_MD}\nrisk-assessment-framework e apiKey: process.env.OPENAI_API_KEY\n` });
    assert.deepEqual(falhas(falsoPositivo), []);
  });

  it('CA7 varre TODOS os medir.* da pasta, não só o primeiro (medir.mjs limpo + medir.py com chave)', async () => {
    const chave = 'sk-' + 'q1w2e3r4'.repeat(4);
    const res = await comAlteracao(null, 'ca7e', { extras: { 'medir.py': `API_KEY = "${chave}"\n` } });
    assert.deepEqual(falhas(res), ['CA7']);
    assert.match(problemas(res, 'CA7'), /medir\.py:1/);
    assert.ok(!JSON.stringify(res).includes('q1w2e3r4'), 'a mensagem nunca repete o segredo');
    const limpos = await comAlteracao(null, 'ca7f', { extras: { 'medir.py': 'print("ok")\n' } });
    assert.deepEqual(falhas(limpos), []);
  });

  it('CA1: poucas chamadas, null no lugar de objetos, base_url com credenciais/query e medir.mjs ausente reprovam sem exceção', async () => {
    assert.ok(falhas(await comAlteracao((r) => { r.chamadas = r.chamadas.slice(0, 5); return r; }, 'ca1a')).includes('CA1'));
    assert.ok(falhas(await comAlteracao((r) => { r.chamadas.push(null); return r; }, 'ca1b')).includes('CA1'));
    assert.ok(falhas(await comAlteracao((r) => { r.ambiente.base_url = 'http://h/v1?key=segredo1234'; return r; }, 'ca1c')).includes('CA1'));
    assert.match(problemas(await comAlteracao(null, 'ca1d', { semMedir: true }), 'CA1'), /medir\.mjs/);
    assert.deepEqual(falhas(await comAlteracao(null, 'ca1e', { jsonBruto: 'null' })), ['CA1']);
    assert.deepEqual(falhas(await comAlteracao(null, 'ca1f', { jsonBruto: '[1,2]' })), ['CA1']);
    assert.deepEqual(falhas(await comAlteracao(null, 'ca1g', { jsonBruto: '{ não é json' })), ['CA1']);
    assert.ok(falhas(await comAlteracao((r) => { r.chamadas[0].latencia_ms = 0; return r; }, 'ca1h')).includes('CA1'));
  });

  it('o script de medição pode estar em outra linguagem (medir.py, medir.ts)', async () => {
    for (const nome of ['medir.py', 'medir.ts', 'MEDIR.JS']) assert.deepEqual(falhas(await comAlteracao(null, 'lang', { medirNome: nome })), [], nome);
    assert.ok(falhas(await comAlteracao(null, 'lang2', { medirNome: 'medicao.py' })).includes('CA1'), 'o nome precisa começar com medir.');
  });

  it('CA8 reprova o template cru, seções ausentes e comentários do modelo que contam como texto', async () => {
    const template = await readFile(path.join(aqui, '..', '..', 'templates', 'entrega-laboratorio.md'), 'utf8');
    assert.ok(falhas(await comAlteracao(null, 'ca8a', { md: template })).includes('CA8'), 'o modelo cru não vale');
    const semSecao = RELATORIO_MD.replace('## Explicação', '## Outra coisa');
    assert.match(problemas(await comAlteracao(null, 'ca8b', { md: semSecao }), 'CA8'), /falta a seção "## Explicação"/);
    const soComentarios = RELATORIO_MD.replace(/(## Explicação\n\n)[\s\S]*?(\n\n## Surpresas)/, `$1> ${PARAGRAFO.repeat(20)}\n<!-- ${PARAGRAFO.repeat(20)} -->$2`);
    assert.match(problemas(await comAlteracao(null, 'ca8c', { md: soComentarios }), 'CA8'), /Explicação/);
    assert.ok(falhas(await comAlteracao(null, 'ca8d', { md: null })).includes('CA8'));
  });

  it('pasta vazia reprova no CA1 e o programa de linha de comando sai com os códigos certos', async () => {
    const vazia = await mkdtemp(path.join(tmpdir(), 'licao01-vazia-'));
    try {
      assert.deepEqual(falhas(await verificar(vazia)), ['CA1']);
      const sem = spawnSync(process.execPath, [path.join(aqui, 'verificar.mjs')], { encoding: 'utf8' });
      assert.equal(sem.status, 2);
      assert.match(sem.stderr, /uso: node verificar\.mjs/);
      const ruim = spawnSync(process.execPath, [path.join(aqui, 'verificar.mjs'), vazia], { encoding: 'utf8' });
      assert.equal(ruim.status, 1);
      assert.match(ruim.stdout, /\[falhou\] CA1/);
      const bom = spawnSync(process.execPath, [path.join(aqui, 'verificar.mjs'), pasta], { encoding: 'utf8' });
      assert.equal(bom.status, 0, bom.stdout + bom.stderr);
      assert.match(bom.stdout, /8\/8 critérios cumpridos/);
    } finally {
      await rm(vazia, { recursive: true, force: true });
    }
  });
});
