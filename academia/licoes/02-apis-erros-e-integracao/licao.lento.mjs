// Testes da infraestrutura da Lição 2 (não de um modelo): o servidor falso, o verificador e as soluções de referência funcionam juntos.
// O núcleo é um TESTE DE MUTAÇÃO do verificador: pegamos a solução de referência em TypeScript, estragamos UMA coisa de cada vez (não repetir,
// repetir demais, ignorar o Retry-After, vazar a chave...) e exigimos que o verificador reprove exatamente o critério certo.
//
// LENTO (cerca de 3 minutos): executa os programas de referência de verdade, centenas de vezes. Por isso o arquivo termina em
// `.lento.mjs` e fica FORA do `node --test "academia/**/*.test.mjs"`. Rode com:
//
//   node academia/ferramentas/testar.mjs --lentos
//   node --test academia/licoes/02-apis-erros-e-integracao/licao.lento.mjs     # só este arquivo
//
// Rode antes de mexer em `verificar.mjs`, `kit/` ou `referencia/`, e sempre no CI (`testar.mjs --tudo`).
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { symlinkSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { NOMES_DOS_TIPOS, PADROES, REPETIVEIS, TIPOS_DE_ERRO } from './kit/contrato.mjs';
import { CENARIOS, iniciarServidor, portaFechada } from './kit/servidor-falso.mjs';
import { dividirComando, verificar } from './verificar.mjs';

const exec = promisify(execFile);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const temporarias = [];
after(async () => { for (const d of temporarias) await rm(d, { recursive: true, force: true }); });

const PARAGRAFO = 'Texto de teste com conteúdo suficiente para ocupar a seção do relatório do aluno. ';
const RELATORIO_OK = `# Relatório\n\n## Resultados\n\n${PARAGRAFO.repeat(8)}\n\n## Explicação\n\n${PARAGRAFO.repeat(16)}\n\n## Surpresas e limites\n\n${PARAGRAFO.repeat(8)}\n`;
// Normaliza CRLF: num checkout do Windows com autocrlf os arquivos vêm com CR+LF, e as trocas de texto dos mutantes não achariam o trecho.
const lerReferencia = async (nome) => (await readFile(path.join(aqui, 'referencia', nome), 'utf8')).replace(/\r\n/g, '\n');
const REF_TS = await lerReferencia('chamar.ts');
const REF_PY = await lerReferencia('chamar.py');

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

/** Liga um servidor falso, roda `fn` e SEMPRE o fecha (uma asserção que falha não deixa o servidor aberto pendurando o processo de teste). */
async function comServidor(opcoes, fn) {
  const s = await iniciarServidor(opcoes);
  try { return await fn(s); } finally { await s.fechar(); }
}

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
    assert.equal(Object.keys(CENARIOS).length, 19);
    await comServidor({ passos: CENARIOS.sucesso.passos }, async (s) => {
      const r = await fetch(`${s.url}/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer abc', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'm', messages: [], max_tokens: 5 }) });
      const j = await r.json();
      assert.equal(r.status, 200);
      assert.equal(j.choices[0].message.content, 'Olá');
      assert.equal(s.registro.length, 1);
      assert.equal(s.registro[0].corpo.max_tokens, 5);
      assert.equal((await fetch(`${s.url}/outra-rota`, { method: 'POST', body: '{}' })).status, 404);
    });
  });

  it('a resposta pode ser sobrescrita por execução (o verificador sorteia texto e usage para ninguém decorá-los)', async () => {
    await comServidor({ passos: CENARIOS.sucesso.passos, resposta: { texto: 'Olá abc123', uso: { prompt_tokens: 41, completion_tokens: 5, total_tokens: 46 } } }, async (s) => {
      const j = await (await fetch(`${s.url}/chat/completions`, { method: 'POST', body: JSON.stringify({ model: 'm', messages: [] }) })).json();
      assert.equal(j.choices[0].message.content, 'Olá abc123');
      assert.deepEqual(j.usage, { prompt_tokens: 41, completion_tokens: 5, total_tokens: 46 });
    });
    await comServidor({ passos: CENARIOS.truncado.passos, resposta: { texto: 'não deve aparecer', uso: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } }, async (s) => {
      const j = await (await fetch(`${s.url}/chat/completions`, { method: 'POST', body: JSON.stringify({ model: 'm', messages: [] }) })).json();
      assert.equal(j.choices[0].finish_reason, 'length', 'a sobrescrita só vale para respostas normais (stop)');
      assert.equal(j.choices[0].message.content, 'Olá, tudo be');
    });
  });

  it('o 401 repete a chave recebida (é o que o cliente precisa saber esconder) e o provedor B recusa max_tokens e temperature', async () => {
    await comServidor({ passos: CENARIOS['chave-invalida'].passos }, async (s) => {
      const r = await fetch(`${s.url}/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer minha-chave-123' }, body: JSON.stringify({ model: 'm', messages: [] }) });
      assert.match(JSON.stringify(await r.json()), /minha-chave-123/);
    });
    await comServidor({ passos: CENARIOS['provedor-b'].passos, perfil: 'openai-novo' }, async (s) => {
      const pede = (corpo) => fetch(`${s.url}/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer k', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'm', messages: [], ...corpo }) });
      assert.equal((await pede({ max_tokens: 5 })).status, 400);
      assert.equal((await pede({ max_completion_tokens: 5, temperature: 0 })).status, 400);
      assert.equal((await pede({ max_completion_tokens: 5 })).status, 200);
    });
  });

  it('o 429 de teto de gasto no formato da Anthropic tem o mesmo type de um limite de taxa e não traz retry-after', async () => {
    await comServidor({ passos: CENARIOS['cota-esgotada-formato-b'].passos }, async (s) => {
      const r = await fetch(`${s.url}/chat/completions`, { method: 'POST', body: JSON.stringify({ model: 'm', messages: [] }) });
      const j = await r.json();
      assert.equal(r.status, 429);
      assert.equal(r.headers.get('retry-after'), null);
      assert.equal(j.error.type, 'rate_limit_error');
      assert.equal(j.error.details.error_code, 'enforced_spend_limit_reached');
    });
  });

  it('a porta "fechada" realmente recusa conexões, e passos se repetem depois do último', async () => {
    const porta = await portaFechada();
    await assert.rejects(fetch(`http://127.0.0.1:${porta}/v1/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(2000) }));
    await comServidor({ passos: CENARIOS['servidor-instavel'].passos }, async (s) => {
      const chama = async () => (await fetch(`${s.url}/chat/completions`, { method: 'POST', body: JSON.stringify({ model: 'm', messages: [] }) })).status;
      assert.deepEqual([await chama(), await chama(), await chama(), await chama()], [500, 503, 200, 200]);
    });
  });
});

describe('dividirComando (--comando com aspas e espaços)', () => {
  it('respeita aspas duplas, separa por espaços fora delas e aceita um executável simples', () => {
    assert.deepEqual(dividirComando('python'), ['python']);
    assert.deepEqual(dividirComando('uv run python'), ['uv', 'run', 'python']);
    assert.deepEqual(dividirComando('"C:\\Program Files\\Python\\python.exe" -X utf8'), ['C:\\Program Files\\Python\\python.exe', '-X', 'utf8']);
    assert.deepEqual(dividirComando('  py   -3  '), ['py', '-3']);
    assert.deepEqual(dividirComando(''), []);
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
    ['ignora o teto do backoff MESMO com jitter (o caso que a revisão achou: passava ~20% das vezes)', [['const limite = Math.min(tetoMs, baseMs * 2 ** (tentativaQueFalhou - 1));', 'const limite = baseMs * 2 ** (tentativaQueFalhou - 1);']], ['CA5'], ['CA5'], /BACKOFF_TETO_MS=100 não foi respeitado/],
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

  it('429 de teto de gasto no formato da Anthropic tratado como limite de taxa dá AVISO (o critério muda por provedor); a referência o trata como cota', async () => {
    const semOCampo = estragar(['const detalhe = typeof e?.details?.error_code === \'string\' ? e.details.error_code : \'\';', 'const detalhe = \'\';']);
    const comOAviso = await verificar(await entrega({ codigo: semOCampo }));
    assert.deepEqual(falhas(comOAviso), [], 'não reprova: o critério de cota muda por provedor');
    assert.match(comOAviso.avisos.join('\n'), /formato da Anthropic/);
    const referencia = await verificar(await entrega());
    assert.deepEqual(referencia.avisos, []);
  });

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

describe('variações corretas que o verificador DEVE aceitar (falsos negativos que a revisão encontrou)', () => {
  const pythonDisponivel = ['python3', 'python'].find((c) => {
    try { return /Python 3\./.test(execFileSync(c, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch { return false; }
  });

  it('a ordem das chaves de objetos não importa (messages e usage em outra ordem; json.dumps com sort_keys)', { skip: !temTypeScript && 'este Node não executa .ts' }, async () => {
    const codigo = estragar(
      ["messages: [{ role: 'user', content: prompt }]", "messages: [{ content: prompt, role: 'user' }]"],
      ['usage: { prompt_tokens: uso.prompt_tokens ?? 0, completion_tokens: uso.completion_tokens ?? 0, total_tokens: uso.total_tokens ?? 0 },', 'usage: { total_tokens: uso.total_tokens ?? 0, completion_tokens: uso.completion_tokens ?? 0, prompt_tokens: uso.prompt_tokens ?? 0 },'],
    );
    assert.deepEqual(falhas(await verificar(await entrega({ codigo }), { so: ['CA2'] })), []);
  });

  it('Python com sort_keys=True e com ensure_ascii desligado passa, também com --comando (o ambiente força UTF-8)', { skip: !pythonDisponivel && 'Python 3 não encontrado' }, async () => {
    const trocar = (de, para) => { assert.equal(REF_PY.split(de).length, 2, de); return REF_PY.replace(de, () => para); };
    let codigo = trocar('body=json.dumps(corpo).encode("utf-8")', 'body=json.dumps(corpo, sort_keys=True).encode("utf-8")');
    codigo = codigo.replace('print(json.dumps({"ok": True, **r}))', 'print(json.dumps({"ok": True, **r}, sort_keys=True, ensure_ascii=False))');
    const pasta = await entrega({ arquivo: 'chamar.py', codigo });
    assert.deepEqual(falhas(await verificar(pasta, { so: ['CA2'] })), []);
    assert.deepEqual(falhas(await verificar(pasta, { so: ['CA2'], comando: pythonDisponivel })), [], 'com --comando o texto acentuado continua certo');
  });

  it('constantes em MAIÚSCULAS que leem o ambiente (padrão de Python e de JavaScript) não reprovam o CA7', { skip: !temTypeScript && 'este Node não executa .ts' }, async () => {
    const extra = ['', 'const env = process.env;', 'const MAX_TOKENS = Number(process.env.MAX_TOKENS ?? 64);', 'const API_KEY = process.env.OPENAI_API_KEY;', 'const CHAVE_API_KEY = env.OPENAI_API_KEY ?? "";', ''].join('\n');
    const res = await verificar(await entrega({ codigo: `${REF_TS}${extra}` }), { so: ['CA7'] });
    assert.deepEqual(falhas(res), [], problemas(res, 'CA7'));
  });

  it('o programa que lê o stdin recebe o fim do arquivo (não trava até o limite de tempo)', async () => {
    const t0 = Date.now();
    const res = await verificar(await entrega({ arquivo: 'chamar.mjs', codigo: "process.stdin.resume(); process.stdin.on('end', () => console.log('fim'));" }), { limiteMs: 6000 });
    assert.ok(Date.now() - t0 < 5500, 'não esperou o limite de tempo');
    assert.doesNotMatch(problemas(res, 'CA1'), /não terminou/);
    assert.match(problemas(res, 'CA1'), /não é JSON válido/);
  });

  it('sintaxe que o Node não executa (um enum): o CA1 mostra o erro do stderr em vez de só "veio 0 linhas"', { skip: !temTypeScript && 'este Node não executa .ts' }, async () => {
    const res = await verificar(await entrega({ codigo: `enum Cor { A, B }\n${REF_TS}` }));
    assert.deepEqual(falhas(res).slice(0, 1), ['CA1']);
    assert.match(problemas(res, 'CA1'), /stderr do programa: .*ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
  });

  it('a pasta da entrega pode estar atrás de um symlink ou junction (o programa não "some" por causa disso)', { skip: !temTypeScript && 'este Node não executa .ts' }, async (t) => {
    const pasta = await entrega();
    const atalho = `${pasta}-atalho`;
    try { symlinkSync(pasta, atalho, process.platform === 'win32' ? 'junction' : 'dir'); } catch { t.skip('não consegui criar o link nesta máquina'); return; }
    temporarias.push(atalho);
    assert.deepEqual(falhas(await verificar(atalho, { so: ['CA2'] })), []);
  });

  it('o limite de tempo não conta a partida lenta do interpretador (máquina carregada, antivírus, disco lento)', { skip: !temTypeScript && 'este Node não executa .ts' }, async () => {
    const lento = estragar(['  process.exitCode = await principal(process.argv.slice(2), process.env);', '  await new Promise((resolve) => setTimeout(resolve, 2500)); // simula uma partida lenta\n  process.exitCode = await principal(process.argv.slice(2), process.env);']);
    const res = await verificar(await entrega({ codigo: lento }), { so: ['CA6'] });
    assert.deepEqual(falhas(res), [], problemas(res, 'CA6'));
  });
});

describe('--arquivo e --comando', () => {
  it('com dois programas na pasta, --comando exige dizer qual (--arquivo); sem --comando só avisa', { skip: !temTypeScript && 'este Node não executa .ts' }, async () => {
    const pasta = await entrega();
    await writeFile(path.join(pasta, 'chamar.py'), REF_PY);
    const semArquivo = await verificar(pasta, { comando: process.execPath.includes(' ') ? `"${process.execPath}"` : process.execPath, so: ['CA2'] });
    assert.match(problemas(semArquivo, 'CA1'), /diga qual verificar com --arquivo chamar\.ts/);
    const inexistente = await verificar(pasta, { arquivo: 'chamar.rb', so: ['CA2'] });
    assert.match(problemas(inexistente, 'CA1'), /não encontrei esse programa/);
    const automatico = await verificar(pasta, { so: ['CA2'] });
    assert.deepEqual(falhas(automatico), []);
    assert.match(automatico.avisos.join('\n'), /mais de um programa.*--arquivo/);
  });

  it('--arquivo escolhe QUAL programa verificar quando há mais de um (o primeiro da ordem não é o único possível)', async () => {
    const pasta = await entrega();
    await writeFile(path.join(pasta, 'chamar.mjs'), "console.log('isto não é o JSON do contrato');");
    const padrao = await verificar(pasta, { so: ['CA2'] });
    assert.deepEqual(falhas(padrao), [], 'sem --arquivo vale o primeiro (chamar.ts)');
    const escolhido = await verificar(pasta, { arquivo: 'chamar.mjs', so: ['CA2'] });
    assert.ok(falhas(escolhido).includes('CA1'), 'com --arquivo chamar.mjs verifica o outro programa');
    assert.match(problemas(escolhido, 'CA1'), /não é JSON válido/);
  });

  it('um programa que decora o texto da resposta (o servidor sorteia o texto e o usage a cada execução) reprova o CA2', async () => {
    const decorado = [
      'const r = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ model: process.env.MODELO_CHAT, messages: [{ role: "user", content: process.argv[2] }], max_tokens: 64, temperature: 0 }) });',
      'const j = await r.json();',
      'console.log(JSON.stringify({ ok: true, texto: "Olá", finish_reason: j.choices[0].finish_reason, usage: j.usage, tentativas: 1 }));',
    ].join('\n');
    const res = await verificar(await entrega({ arquivo: 'chamar.mjs', codigo: decorado }), { so: ['CA2'] });
    assert.deepEqual(falhas(res), ['CA2']);
    assert.match(problemas(res, 'CA2'), /texto deveria ser o que o servidor devolveu/);
  });

  it('--comando aceita um caminho entre aspas (com espaços, como o node.exe em "Program Files")', { skip: !temTypeScript && 'este Node não executa .ts' }, async () => {
    const res = await verificar(await entrega(), { comando: `"${process.execPath}"`, so: ['CA2'] });
    assert.deepEqual(falhas(res), [], problemas(res, 'CA2'));
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
