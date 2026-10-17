// Testes da infraestrutura da Lição 1 (não do modelo): a solução de referência e o verificador funcionam juntos.
// Um servidor falso, compatível com a API de chat, faz o papel do LLM. Ele conta "tokens" de um jeito simples e
// determinístico (4 caracteres por token + custo fixo por mensagem), então NÃO substitui rodar com um LLM real.
//
//   node --test academia/licoes/01-tokens-contexto-inferencia/licao.test.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

before(async () => {
  servidor = createServer((req, res) => {
    let dados = '';
    req.on('data', (c) => (dados += c));
    req.on('end', () => {
      const { atrasoMs, json } = responder(JSON.parse(dados));
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
  const paragrafo = 'Texto de teste com conteúdo suficiente para ocupar a seção do relatório do aluno. '.repeat(8);
  await writeFile(
    path.join(pasta, 'relatorio.md'),
    `# Relatório\n\n## Resultados\n\n${paragrafo}\n\n## Explicação\n\n${paragrafo}${paragrafo}\n\n## Surpresas e limites\n\n${paragrafo}\n`,
  );
});

after(async () => {
  servidor.close();
  await rm(pasta, { recursive: true, force: true });
});

const lerRelatorio = async () => JSON.parse(await readFile(path.join(pasta, 'relatorio.json'), 'utf8'));
async function comAlteracao(alterar, nome) {
  const copia = await mkdtemp(path.join(tmpdir(), `licao01-${nome}-`));
  const r = await lerRelatorio();
  alterar(r);
  await writeFile(path.join(copia, 'relatorio.json'), JSON.stringify(r));
  await writeFile(path.join(copia, 'relatorio.md'), await readFile(path.join(pasta, 'relatorio.md'), 'utf8'));
  try {
    return await verificar(copia);
  } finally {
    await rm(copia, { recursive: true, force: true });
  }
}
const falhas = (res) => res.resultados.filter((c) => !c.ok).map((c) => c.id);

describe('solução de referência + verificador', () => {
  it('a solução gera um relatório que cumpre CA1–CA8', async () => {
    const res = await verificar(pasta);
    assert.deepEqual(falhas(res), [], JSON.stringify(res.resultados.filter((c) => !c.ok), null, 2));
    assert.equal(res.resultados.length, 8);
  });

  it('o relatório registra 12 chamadas e não grava a chave de API', async () => {
    const r = await lerRelatorio();
    assert.equal(r.chamadas.length, 12);
    assert.ok(!JSON.stringify(r).includes('chave-de-teste'));
  });

  it('CA2 detecta razão PT/EN adulterada', async () => {
    const res = await comAlteracao((r) => { r.experimentos.idioma.razao_tokens_pt_en = 9; }, 'ca2');
    assert.deepEqual(falhas(res), ['CA2']);
  });

  it('CA3 detecta inclinação adulterada', async () => {
    const res = await comAlteracao((r) => { r.experimentos.crescimento.tokens_por_char_marginal = 1; }, 'ca3');
    assert.deepEqual(falhas(res), ['CA3']);
  });

  it('CA4 exige finish_reason "length"', async () => {
    const res = await comAlteracao((r) => { r.chamadas.find((c) => c.id === 'trunc').finish_reason = 'stop'; }, 'ca4');
    assert.deepEqual(falhas(res), ['CA4']);
  });

  it('CA5 exige que o modelo não lembre sem histórico', async () => {
    const res = await comAlteracao((r) => {
      r.chamadas.find((c) => c.id === 'mem-sem').resposta = 'Zephyrus-42';
      r.experimentos.sem_memoria.sem_historico_lembrou = true;
    }, 'ca5');
    assert.deepEqual(falhas(res), ['CA5']);
  });

  it('CA6 exige mais tokens de saída na chamada longa', async () => {
    const res = await comAlteracao((r) => { r.chamadas.find((c) => c.id === 'dec-longa').completion_tokens = 1; }, 'ca6');
    assert.ok(falhas(res).includes('CA6'));
  });

  it('CA7 detecta chave de API no relatório', async () => {
    const res = await comAlteracao((r) => { r.ambiente.chave = 'sk-' + 'a1b2c3d4'.repeat(4); }, 'ca7');
    assert.deepEqual(falhas(res), ['CA7']);
  });

  it('CA1 reprova com menos de 12 chamadas', async () => {
    const res = await comAlteracao((r) => { r.chamadas = r.chamadas.slice(0, 5); }, 'ca1');
    assert.ok(falhas(res).includes('CA1'));
  });

  it('pasta vazia reprova no CA1 sem lançar exceção', async () => {
    const vazia = await mkdtemp(path.join(tmpdir(), 'licao01-vazia-'));
    try {
      assert.deepEqual(falhas(await verificar(vazia)), ['CA1']);
    } finally {
      await rm(vazia, { recursive: true, force: true });
    }
  });
});
