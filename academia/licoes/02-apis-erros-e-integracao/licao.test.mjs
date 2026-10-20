// Testes da infraestrutura da Lição 2 (não de um modelo): o servidor falso, o verificador e as soluções de referência funcionam juntos.
// O núcleo é um TESTE DE MUTAÇÃO do verificador: pegamos a solução de referência em TypeScript, estragamos UMA coisa de cada vez (não repetir,
// repetir demais, ignorar o Retry-After, vazar a chave...) e exigimos que o verificador reprove exatamente o critério certo.
//
//   node --test academia/licoes/02-apis-erros-e-integracao/licao.test.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { NOMES_DOS_TIPOS, PADROES, REPETIVEIS, TIPOS_DE_ERRO } from './kit/contrato.mjs';
import { CENARIOS, iniciarServidor, portaFechada } from './kit/servidor-falso.mjs';
import { verificar } from './verificar.mjs';

const exec = promisify(execFile);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const temporarias = [];
after(async () => { for (const d of temporarias) await rm(d, { recursive: true, force: true }); });

const PARAGRAFO = 'Texto de teste com conteúdo suficiente para ocupar a seção do relatório do aluno. ';
const RELATORIO_OK = `# Relatório\n\n## Resultados\n\n${PARAGRAFO.repeat(8)}\n\n## Explicação\n\n${PARAGRAFO.repeat(16)}\n\n## Surpresas e limites\n\n${PARAGRAFO.repeat(8)}\n`;
const REF_TS = await readFile(path.join(aqui, 'referencia', 'chamar.ts'), 'utf8');
const REF_PY = await readFile(path.join(aqui, 'referencia', 'chamar.py'), 'utf8');

/** Cria uma pasta de entrega com o programa (e o relatório) e devolve o caminho. */
async function entrega({ arquivo = 'chamar.ts', codigo = REF_TS, md = RELATORIO_OK } = {}) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'licao02-'));
  temporarias.push(pasta);
  if (codigo !== null) await writeFile(path.join(pasta, arquivo), codigo);
  await writeFile(path.join(pasta, 'package.json'), '{ "type": "module" }\n');
  if (md !== null) await writeFile(path.join(pasta, 'relatorio.md'), md);
  return pasta;
}

/** A referência com uma ou mais trocas de texto. Falha se o trecho não existir (o teste não pode "passar" por engano). */
function estragar(...trocas) {
  let codigo = REF_TS;
  for (const [de, para] of trocas) {
    assert.equal(codigo.split(de).length, 2, `trecho ausente ou repetido na referência: ${de.slice(0, 70)}`);
    codigo = codigo.replace(de, () => para);
  }
  return codigo;
}

const falhas = (res) => res.resultados.filter((c) => !c.ok).map((c) => c.id);
const problemas = (res, id) => res.resultados.find((c) => c.id === id)?.problemas.join('\n') ?? '';
const temPython = await exec('python', ['--version']).then((r) => /Python 3\./.test(r.stdout + r.stderr), () => false)
  || await exec('python3', ['--version']).then((r) => /Python 3\./.test(r.stdout + r.stderr), () => false)
  || await exec('py', ['-3', '--version']).then((r) => /Python 3\./.test(r.stdout + r.stderr), () => false);
const temTypeScript = Boolean(process.features.typescript);

describe('contrato e servidor falso', () => {
  it('o contrato tem nove tipos de erro, quatro deles repetíveis, e padrões que são texto de variável de ambiente', () => {
    assert.equal(NOMES_DOS_TIPOS.length, 9);
    assert.deepEqual(REPETIVEIS.sort(), ['limite_de_taxa', 'rede', 'servidor', 'timeout']);
    for (const t of NOMES_DOS_TIPOS) assert.ok(TIPOS_DE_ERRO[t].quando.length > 10, t);
    for (const [k, v] of Object.entries(PADROES)) assert.equal(typeof v, 'string', k);
  });

  it('todo cenário tem descrição e passos válidos; o servidor registra o pedido e responde como descrito', async () => {
    for (const [nome, c] of Object.entries(CENARIOS)) {
      assert.ok(c.descricao.length > 10 && c.passos.length >= 1, nome);
    }
    const s = await iniciarServidor({ passos: CENARIOS.sucesso.passos });
    const r = await fetch(`${s.url}/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer abc', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'm', messages: [], max_tokens: 5 }) });
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.choices[0].message.content, 'Olá');
    assert.equal(s.registro.length, 1);
    assert.equal(s.registro[0].corpo.max_tokens, 5);
    const outra = await fetch(`${s.url}/outra-rota`, { method: 'POST', body: '{}' });
    assert.equal(outra.status, 404);
    await s.fechar();
  });

  it('o 401 repete a chave recebida (é o que o cliente precisa saber esconder) e o provedor B recusa max_tokens e temperature', async () => {
    let s = await iniciarServidor({ passos: CENARIOS['chave-invalida'].passos });
    const r = await fetch(`${s.url}/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer minha-chave-123' }, body: JSON.stringify({ model: 'm', messages: [] }) });
    assert.match(JSON.stringify(await r.json()), /minha-chave-123/);
    await s.fechar();
    s = await iniciarServidor({ passos: CENARIOS['provedor-b'].passos, perfil: 'openai-novo' });
    const pede = (corpo) => fetch(`${s.url}/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer k', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'm', messages: [], ...corpo }) });
    assert.equal((await pede({ max_tokens: 5 })).status, 400);
    assert.equal((await pede({ max_completion_tokens: 5, temperature: 0 })).status, 400);
    assert.equal((await pede({ max_completion_tokens: 5 })).status, 200);
    await s.fechar();
  });

  it('a porta "fechada" realmente recusa conexões, e passos se repetem depois do último', async () => {
    const porta = await portaFechada();
    await assert.rejects(fetch(`http://127.0.0.1:${porta}/v1/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(2000) }));
    const s = await iniciarServidor({ passos: CENARIOS['servidor-instavel'].passos });
    const chama = async () => (await fetch(`${s.url}/chat/completions`, { method: 'POST', body: JSON.stringify({ model: 'm', messages: [] }) })).status;
    assert.deepEqual([await chama(), await chama(), await chama(), await chama()], [500, 503, 200, 200]);
    await s.fechar();
  });
});

describe('soluções de referência passam em tudo (verificação completa)', () => {
  it('TypeScript: CA1 a CA9, sem avisos', { skip: !temTypeScript && 'este Node não executa .ts' }, async () => {
    const res = await verificar(await entrega());
    assert.deepEqual(falhas(res), [], res.resultados.filter((c) => !c.ok).map((c) => `${c.id}: ${c.problemas.join(' | ')}`).join('\n'));
    assert.equal(res.resultados.length, 9);
    assert.deepEqual(res.avisos, []);
  });

  it('Python (só biblioteca padrão): CA1 a CA9, sem avisos (inclui o prazo total contra o corpo em conta-gotas)', { skip: !temPython && 'Python 3 não encontrado' }, async () => {
    const res = await verificar(await entrega({ arquivo: 'chamar.py', codigo: REF_PY }));
    assert.deepEqual(falhas(res), [], res.resultados.filter((c) => !c.ok).map((c) => `${c.id}: ${c.problemas.join(' | ')}`).join('\n'));
    assert.deepEqual(res.avisos, []);
  });
});

describe('teste de mutação do verificador: cada defeito reprova o critério certo', { skip: !temTypeScript && 'este Node não executa .ts' }, () => {
  const mutantes = [
    ['nunca repete', [['if (!erro.repetivel || tentativa >= cfg.maxTentativas) throw erro;', 'throw erro;']], ['CA4', 'CA5'], ['CA4', 'CA5'], /terminar com sucesso/],
    ['repete até o que não se resolve (401, 400, cota, truncado...)', [["new Set<TipoDeErro>(['rede', 'timeout', 'limite_de_taxa', 'servidor'])", "new Set<TipoDeErro>(['rede', 'timeout', 'limite_de_taxa', 'servidor', 'autenticacao', 'cota_esgotada', 'requisicao_invalida', 'truncado', 'resposta_invalida'])"]], ['CA3', 'CA4'], ['CA3', 'CA4'], /não adianta tentar de novo/],
    ['uma tentativa a mais que o limite', [['tentativa >= cfg.maxTentativas', 'tentativa > cfg.maxTentativas']], ['CA4'], ['CA4'], /exatamente 3 pedidos/],
    ['relata `tentativas` errado', [['tentativas: tentativa };', 'tentativas: 1 };']], ['CA4'], ['CA4'], /tentativas/],
    ['429 de cota tratado como limite de taxa', [['PADRAO_DE_COTA.test(codigo) ?', 'false ?']], ['CA3', 'CA4'], ['CA3', 'CA4'], /cota_esgotada/],
    ['truncado devolvido como sucesso', [["if (escolha.finish_reason === 'length') {", 'if (false) {']], ['CA3'], ['CA3'], /truncado/],
    ['ignora o Retry-After', [['const espera = pedida ?? esperaDeBackoff(', 'const espera = esperaDeBackoff(']], ['CA5'], ['CA5'], /honre o cabeçalho/],
    ['sem backoff (espera zero)', [['esperaDeBackoff(tentativa, cfg.backoffBaseMs, cfg.backoffTetoMs, ganchos.aleatorio)', '0']], ['CA5'], ['CA5'], /não há espera/],
    ['ignora o teto do backoff', [['const limite = Math.min(tetoMs, baseMs * 2 ** (tentativaQueFalhou - 1));', 'const limite = baseMs * 2 ** (tentativaQueFalhou - 1);'], ['return Math.floor(aleatorio() * limite);', 'return limite;']], ['CA5'], ['CA5'], /BACKOFF_TETO_MS=100 não foi respeitado/],
    ['ignora BACKOFF_BASE_MS (espera fixa grande)', [['const limite = Math.min(tetoMs, baseMs * 2 ** (tentativaQueFalhou - 1));', 'const limite = Math.min(tetoMs, 5000 * 2 ** (tentativaQueFalhou - 1));'], ['return Math.floor(aleatorio() * limite);', 'return limite;']], ['CA5'], ['CA5'], /antes da 2ª tentativa/],
    ['espera o Retry-After de uma hora', [['if (pedida !== null && pedida > cfg.esperaMaxMs) throw erro; // o provedor pediu mais espera do que aceitamos: desista, não trave', '']], ['CA5'], ['CA1', 'CA5'], /desistir na hora/, { limiteMs: 4000 }],
    ['sem timeout', [['signal: AbortSignal.timeout(cfg.timeoutMs),', '']], ['CA6'], ['CA6'], /deveria dar erro "timeout"/],
    ['timeout curto demais (mata o que é só lento)', [['AbortSignal.timeout(cfg.timeoutMs)', 'AbortSignal.timeout(Math.min(cfg.timeoutMs, 100))']], ['CA6'], ['CA6'], /deveria dar sucesso na 1ª tentativa/],
    ['repete a chave na mensagem de erro', [['const texto = `HTTP ${status}: ${mascarar(mensagem, chave)}`;', 'const texto = `HTTP ${status}: ${mensagem}`;'], ['mensagem: mascarar(erro.message, cfg.chave)', 'mensagem: erro.message']], ['CA7'], ['CA7'], /a chave apareceu no stdout/],
    ['nome do teto de saída fixo no código', [['[cfg.paramMaxTokens]: cfg.maxTokens', 'max_tokens: cfg.maxTokens']], ['CA2', 'CA8'], ['CA8'], /provedor B/],
    ['envia temperature mesmo com TEMPERATURA=omitir', [['if (cfg.temperatura !== null) corpo.temperature = cfg.temperatura;', 'corpo.temperature = cfg.temperatura ?? 0;']], ['CA8'], ['CA8'], /provedor B/],
    ['cabeçalho Authorization sem Bearer', [['authorization: `Bearer ${cfg.chave}`', 'authorization: cfg.chave']], ['CA2'], ['CA2'], /Authorization/],
    ['rota errada', [['${cfg.baseURL}/chat/completions', '${cfg.baseURL}/completions']], ['CA2'], ['CA2'], /\/v1\/chat\/completions/],
    ['imprime log no stdout', [['const prompt = argv[0];', "console.log('depurando...');\n  const prompt = argv[0];"]], null, ['CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8'], /UMA linha JSON/],
  ];
  for (const [nome, trocas, so, esperadas, mensagem, opcoes = {}] of mutantes) {
    it(`reprova ${esperadas.join(' e ')}: ${nome}`, async () => {
      const res = await verificar(await entrega({ codigo: estragar(...trocas) }), { so, ...opcoes });
      assert.deepEqual(falhas(res).sort(), [...esperadas].sort(), res.resultados.map((c) => `${c.id}:${c.ok ? 'ok' : c.problemas[0]}`).join('\n'));
      assert.match(res.resultados.filter((c) => !c.ok).map((c) => c.problemas.join('\n')).join('\n'), mensagem);
    });
  }

  it('só dá AVISO (não reprova) para Retry-After em data e para timeout só por inatividade', async () => {
    const res = await verificar(await entrega({
      codigo: estragar(
        ['const data = Date.parse(v);', 'const data = Number.NaN;'],
        ['  let resposta: Response;\n  let texto: string;\n  try {', '  let resposta: Response;\n  let texto: string;\n  const controle = new AbortController();\n  const cronometro = setTimeout(() => controle.abort(), cfg.timeoutMs);\n  cronometro.unref();\n  try {'],
        ['signal: AbortSignal.timeout(cfg.timeoutMs),', 'signal: controle.signal,'],
        ['texto = await resposta.text();', 'clearTimeout(cronometro);\n    texto = await resposta.text();'],
      ),
    }));
    assert.deepEqual(falhas(res), [], res.resultados.filter((c) => !c.ok).map((c) => `${c.id}: ${c.problemas.join(' | ')}`).join('\n'));
    assert.equal(res.avisos.length, 2, res.avisos.join('\n'));
    assert.match(res.avisos.join('\n'), /formato de data/);
    assert.match(res.avisos.join('\n'), /só por inatividade/);
  });
});

describe('o verificador não trava nem quebra com entregas ruins', () => {
  it('sem programa: CA1 diz o que falta e os demais critérios ficam "não avaliados"', async () => {
    const res = await verificar(await entrega({ codigo: null }));
    assert.deepEqual(falhas(res), ['CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8']);
    assert.match(problemas(res, 'CA1'), /não encontrei chamar\.ts/);
    assert.match(problemas(res, 'CA2'), /não avaliado/);
  });

  it('programa que imprime lixo, que sai com código 2, ou que não imprime JSON: reprova o CA1 só com a execução do cenário sucesso', async () => {
    const casos = [
      ["console.log('olá mundo');", /UMA linha JSON|não é JSON/],
      ["console.error('faltou configurar'); process.exit(2);", /código 2/],
      ["console.log(JSON.stringify({ ok: 'talvez' }));", /campo booleano/],
      ["console.log(JSON.stringify({ ok: false, erro: { tipo: 'inventado', repetivel: true, status: null, mensagem: 'x' }, tentativas: 1 })); process.exitCode = 1;", /erro\.tipo/],
      ["console.log(JSON.stringify({ ok: true, texto: 'x', finish_reason: 'stop', usage: { prompt_tokens: 1 }, tentativas: 1 }));", /usage/],
      ["console.log(JSON.stringify({ ok: true, texto: 'x', finish_reason: 'stop', usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, tentativas: 1 })); process.exitCode = 1;", /código de saída deve ser 0/],
    ];
    for (const [codigo, mensagem] of casos) {
      const res = await verificar(await entrega({ arquivo: 'chamar.mjs', codigo }), { limiteMs: 5000 });
      assert.ok(falhas(res).includes('CA1'), codigo);
      assert.match(problemas(res, 'CA1'), mensagem, codigo);
      assert.match(problemas(res, 'CA2'), /não avaliado/);
    }
  });

  it('programa que trava é encerrado no limite de tempo, com mensagem clara (e sem deixar o teste pendurado)', async () => {
    const t0 = Date.now();
    const res = await verificar(await entrega({ arquivo: 'chamar.mjs', codigo: 'setInterval(() => {}, 1000);' }), { limiteMs: 1200 });
    assert.ok(Date.now() - t0 < 8000);
    assert.match(problemas(res, 'CA1'), /não terminou em 1\.2 s/);
  });

  it('opção --so valida os ids e confere só o pedido; CA9 reprova relatório curto, sem seção, só com comentários e com chave', async () => {
    await assert.rejects(verificar(await entrega(), { so: ['CA99'] }), /critério desconhecido: CA99/);
    const chave = ['sk', 'zz', 'a1b2c3d4e5f6g7h8i9j0k1'].join('-');
    const relatorios = [
      [`# R\n\n## Resultados\n\ncurto\n\n## Explicação\n\ncurto\n\n## Surpresas e limites\n\ncurto\n`, /precisa de pelo menos 120/],
      [`# R\n\n## Resultados\n\n${PARAGRAFO.repeat(8)}\n`, /falta a seção "## Explicação"/],
      [`# R\n\n## Resultados\n\n> ${PARAGRAFO.repeat(8)}\n\n## Explicação\n\n<!-- ${PARAGRAFO.repeat(20)} -->\n\n## Surpresas e limites\n\n${PARAGRAFO.repeat(8)}\n`, /os comentários do modelo não contam/],
      [`${RELATORIO_OK}\nA chave usada foi ${chave}.\n`, /possível segredo/],
    ];
    for (const [md, mensagem] of relatorios) {
      const res = await verificar(await entrega({ md }), { so: ['CA9'] });
      assert.deepEqual(falhas(res), ['CA9']);
      assert.match(problemas(res, 'CA9'), mensagem);
    }
    assert.deepEqual(falhas(await verificar(await entrega({ md: null }), { so: ['CA9'] })), ['CA9']);
    assert.deepEqual(falhas(await verificar(await entrega(), { so: ['CA9'] })), []);
  });

  it('chave no código-fonte reprova o CA7 sem repetir a chave na mensagem', async () => {
    const chave = ['sk', 'yy', 'a1b2c3d4e5f6g7h8i9j0k1'].join('-');
    const res = await verificar(await entrega({ codigo: `${REF_TS}\n// const antiga = '${chave}';\n` }), { so: ['CA7'] });
    assert.deepEqual(falhas(res), ['CA7']);
    assert.match(problemas(res, 'CA7'), /possível segredo no código/);
    assert.ok(!JSON.stringify(res).includes('a1b2c3d4e5f6'), 'a chave não pode aparecer na saída do verificador');
  });
});

describe('exemplos da lição', () => {
  it('erro-tipado.ts roda e mostra o que fazer com cada tipo; o `as` falso passa pelo Node (e é isso que a lição ensina)', { skip: !temTypeScript && 'este Node não executa .ts' }, async () => {
    const { stdout } = await exec(process.execPath, [path.join(aqui, 'exemplos', 'erro-tipado.ts')]);
    assert.deepEqual(stdout.trim().split(/\r?\n/), [
      'usar o texto: Olá', 'esperar o Retry-After e tentar de novo', 'parar e avisar: acabou o crédito (esperar não resolve)', 'usar o texto: undefined',
    ]);
  });

  it('backoff-simulado.mjs é determinístico: os números do texto da lição são os que ele imprime', async () => {
    const { stdout } = await exec(process.execPath, [path.join(aqui, 'exemplos', 'backoff-simulado.mjs')]);
    const linha = (nome) => stdout.split(/\r?\n/).find((l) => l.startsWith(nome)).split('|').map((c) => c.trim());
    assert.deepEqual(linha('sem-espera'), ['sem-espera', '1100', '180', '0', '1000 ms']);
    assert.deepEqual(linha('exponencial'), ['exponencial', '1100', '180', '371', '38100 ms']);
    assert.deepEqual(linha('full-jitter'), ['full-jitter', '498', '54', '15', '2100 ms']);
  });

  it('timeout-do-fetch.mjs: sem timeout espera os 3 s; com AbortSignal.timeout aborta em ~400 ms, também com o corpo em conta-gotas', async () => {
    const { stdout } = await exec(process.execPath, [path.join(aqui, 'exemplos', 'timeout-do-fetch.mjs')], { timeout: 30_000 });
    const medidas = [...stdout.matchAll(/→\s+(\d+) ms · (.*)/g)].map((m) => [Number(m[1]), m[2]]);
    assert.equal(medidas.length, 3);
    assert.ok(medidas[0][0] >= 2900 && /HTTP 200/.test(medidas[0][1]));
    for (const [ms, texto] of medidas.slice(1)) assert.ok(ms >= 380 && ms < 1500 && /TimeoutError/.test(texto), `${ms} ms ${texto}`);
  });
});
