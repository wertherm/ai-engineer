// Testes do módulo comum (segredos, endereços, saída segura, texto para terminal).
//   node --test academia/ferramentas/comum.test.mjs
// Os "segredos" abaixo são montados em tempo de execução para não parecerem credenciais reais no código-fonte.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { acharSegredos, enderecoSeguro, limparSaida, mascararProfundo, mascararSegredos, neutralizarControles, paraTerminal, temControle } from './comum.mjs';

const TOKENS = {
  'chave sk-': `sk-${'Ab3x'.repeat(8)}`,
  'chave do Stripe': `sk_live_${'abcdEFGH1234'}`,
  'token Bearer': `Authorization: Bearer ${'abcdef0123456789xyz'}`,
  'autenticação Basic': `Authorization: Basic ${'dXNlcjpwYXNzd29yZDEyMw=='}`,
  'token do GitHub': `ghp_${'a1B2'.repeat(6)}`,
  'token do GitHub (fine-grained)': `github_pat_${'A1b2C3d4E5f6G7h8I9j0K1'}`,
  'token do npm': `npm_${'a1B2c3'.repeat(6)}`,
  'token do GitLab': `glpat-${'abcdEFGH12345678wxyz'}`,
  'chave da AWS': `AKIA${'ABCDEFGH12345678'}`,
  'chave do Google': `AIza${'A1b2C3d4E5'.repeat(3)}abcde`,
  'token do Hugging Face': `hf_${'aB3d'.repeat(8)}`,
  'token do Slack': `xoxb-${'1234567890-abcdef'}`,
  JWT: `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.${'abcdefghijk123'}`,
  'chave privada': `-----BEGIN RSA PRIVATE KEY-----`,
  'URL com usuário e senha': `postgres://admin:S3nhaForte@db.exemplo.com/app`,
  'segredo na query string': `GET /v1/dados?api_key=${'abcdef1234567890'}`,
  'api_key literal': `api_key = "${'abcdefghijklmnop1234'}"`,
  'variável de segredo com valor': `OPENAI_API_KEY=${'abcdef123456'}`,
  'senha em texto': 'a senha do banco é Abc123!x',
};

describe('acharSegredos', () => {
  for (const [nome, texto] of Object.entries(TOKENS)) {
    it(`reconhece: ${nome}`, () => {
      const achados = acharSegredos(`linha 1\n${texto}\nlinha 3`);
      assert.ok(achados.some((a) => a.nome === nome && a.linha === 2), `esperava "${nome}" na linha 2, obteve ${JSON.stringify(achados)}`);
    });
  }

  it('nunca devolve o valor encontrado', () => {
    const achados = acharSegredos(TOKENS['chave sk-']);
    assert.ok(!JSON.stringify(achados).includes('Ab3x'));
  });

  it('não acusa referências a variáveis, marcadores nem prosa comum', () => {
    const limpos = [
      'const k = process.env.OPENAI_API_KEY;',
      'OPENAI_API_KEY=${OPENAI_API_KEY}',
      'API_TOKEN=$TOKEN_DO_CI',
      'OPENAI_API_KEY=<sua-chave-aqui>',
      'A senha é obrigatória para entrar.',
      'a senha deve ter 8 caracteres',
      'o segredo do sucesso é treinar todo dia',
      'Authorization: Bearer <token>',
      'https://exemplo.com/docs/guia?pagina=2',
      'sk-curto',
      'possível segredo (senha em texto); remova e troque a credencial',
      're: /[?&](?:key|password)=[A-Za-z0-9._~-]{8,200}/i',
      'se a senha 12345678 aparecer sem separador, não acusamos (limite conhecido)',
    ];
    for (const t of limpos) assert.deepEqual(acharSegredos(t), [], t);
  });

  it('informa a linha correta e aceita CRLF', () => {
    const achados = acharSegredos(`a\r\nb\r\n${TOKENS['token do GitHub']}\r\n`);
    assert.deepEqual(achados.map((a) => a.linha), [3]);
  });
});

describe('mascararSegredos', () => {
  it('troca cada segredo por *** e preserva o resto', () => {
    for (const [nome, texto] of Object.entries(TOKENS)) {
      const mascarado = mascararSegredos(`antes ${texto} depois`);
      assert.ok(mascarado.includes('***'), nome);
      assert.deepEqual(acharSegredos(mascarado), [], `${nome} ainda detectável após mascarar: ${mascarado}`);
      assert.ok(mascarado.startsWith('antes ') , nome);
    }
  });

  it('mascara o bloco inteiro de uma chave privada, inclusive sem o rodapé', () => {
    const corpo = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC';
    const completo = `x\n-----BEGIN PRIVATE KEY-----\n${corpo}\n-----END PRIVATE KEY-----\ny`;
    const m1 = mascararSegredos(completo);
    assert.ok(!m1.includes(corpo) && m1.startsWith('x\n') && m1.endsWith('\ny'));
    const truncado = mascararSegredos(`-----BEGIN PRIVATE KEY-----\n${corpo}`);
    assert.ok(!truncado.includes(corpo));
  });

  it('mascara senha de URL mesmo quando a senha contém @', () => {
    const m = mascararSegredos('conectando em postgres://admin:S3nha@Forte@db.exemplo.com/app');
    assert.ok(!m.includes('S3nha') && !m.includes('Forte'), m);
    assert.ok(m.includes('db.exemplo.com'));
  });

  it('não altera o que o filtro libera', () => {
    const t = 'OPENAI_API_KEY=process.env.OPENAI_API_KEY e a senha é obrigatória';
    assert.equal(mascararSegredos(t), t);
  });

  it('aceita não-strings', () => {
    assert.equal(mascararSegredos(undefined), 'undefined');
    assert.equal(mascararSegredos(42), '42');
  });
});

describe('mascararProfundo', () => {
  it('mascara valores e chaves em objetos e listas aninhados, sem tocar em números e booleanos', () => {
    const entrada = {
      ok: true, n: 3,
      a: { b: [`usei ${TOKENS['chave sk-']}`, { c: TOKENS['token do GitHub'] }] },
      [TOKENS['chave sk-']]: 'valor',
    };
    const saida = mascararProfundo(entrada);
    const json = JSON.stringify(saida);
    assert.ok(!json.includes('Ab3x') && !json.includes('a1B2'), json);
    assert.equal(saida.ok, true);
    assert.equal(saida.n, 3);
  });

  it('pega o que o mascaramento do JSON já serializado deixaria passar (aspas escapadas)', () => {
    const entrada = { cfg: TOKENS['api_key literal'] };
    assert.ok(!JSON.stringify(mascararProfundo(entrada)).includes('abcdefghijklmnop1234'));
  });

  it('não explode com estrutura muito profunda', () => {
    let o = 'x';
    for (let i = 0; i < 200; i += 1) o = { o };
    assert.ok(JSON.stringify(mascararProfundo(o)).includes('profundidade'));
  });

  it('não altera a entrada', () => {
    const entrada = { k: TOKENS['chave sk-'] };
    mascararProfundo(entrada);
    assert.equal(entrada.k, TOKENS['chave sk-']);
  });
});

describe('desempenho (sem ReDoS)', () => {
  const casos = {
    'letras': 'a'.repeat(200_000),
    'maiúsculas': 'A'.repeat(200_000),
    'senha repetida': 'senha '.repeat(30_000),
    'esquemas': '://'.repeat(60_000),
    'bearer repetido': 'Bearer '.repeat(30_000),
    'URL sem arroba': `http://${'u'.repeat(100_000)}`,
    'espaços': ' '.repeat(200_000),
    'chave privada aberta': `-----BEGIN PRIVATE KEY-----${'x'.repeat(100_000)}`,
  };
  for (const [nome, texto] of Object.entries(casos)) {
    it(`mascarar e achar terminam rápido: ${nome}`, () => {
      const t0 = Date.now();
      mascararSegredos(texto);
      acharSegredos(texto);
      limparSaida(texto);
      assert.ok(Date.now() - t0 < 3000, `${nome} levou ${Date.now() - t0} ms`);
    });
  }
});

describe('enderecoSeguro', () => {
  it('mantém protocolo, host e caminho e remove usuário, senha, query e fragmento', () => {
    assert.equal(enderecoSeguro('https://user:senha@api.exemplo.com:8443/v1/chat?key=abc#x'), 'https://api.exemplo.com:8443/v1/chat');
  });
  it('devolve null quando não é URL', () => {
    assert.equal(enderecoSeguro('isso não é url'), null);
  });
});

describe('limparSaida', () => {
  it('remove credenciais de URL, query string, a chave informada e tokens', () => {
    const chave = 'minha-chave-especial-123';
    const txt = `fetch failed https://user:pa$$@host.exemplo.com/x?key=abcdef12345678 usando ${chave} e ${TOKENS['chave sk-']} e ${TOKENS['token do GitHub']}`;
    const l = limparSaida(txt, { chave });
    for (const proibido of ['user:pa', 'abcdef12345678', chave, 'Ab3x', 'a1B2']) assert.ok(!l.includes(proibido), `vazou ${proibido}: ${l}`);
    assert.ok(l.includes('host.exemplo.com'));
  });

  it('mascara sequências longas que parecem tokens, mas deixa palavras comuns', () => {
    const l = limparSaida(`erro ${'Zq8'.repeat(15)} em conexão`);
    assert.ok(!l.includes('Zq8Zq8'));
    assert.ok(l.includes('erro') && l.includes('em conexão'));
  });

  it('mascara qualquer valor depois de Bearer ou Basic, mesmo curto', () => {
    assert.equal(limparSaida('cabeçalho Bearer abc.def.ghi enviado'), 'cabeçalho Bearer *** enviado');
    assert.ok(!limparSaida('Basic dXNlcg==').includes('dXNlcg'));
  });

  it('ignora chaves curtas demais para não mascarar o texto todo', () => {
    assert.equal(limparSaida('abc abc', { chave: 'ab' }), 'abc abc');
  });
});

describe('temControle / paraTerminal', () => {
  const ESC = String.fromCharCode(0x1b);
  const BIDI = String.fromCharCode(0x202e);
  const ZERO = String.fromCharCode(0x200b);
  const NBOM = String.fromCharCode(0xfeff);
  const C1 = String.fromCharCode(0x9b);

  it('detecta escape ANSI, bidi, largura zero, BOM e C1; texto normal e quebras de linha/tabulação passam', () => {
    for (const c of [ESC, BIDI, ZERO, NBOM, C1, String.fromCharCode(0)]) assert.equal(temControle(`a${c}b`), true, `U+${c.charCodeAt(0).toString(16)}`);
    assert.equal(temControle('texto normal\ncom\ttab e acentuação: ação, ü, 日本語, emoji 🙂'), false);
  });

  it('paraTerminal torna os controles visíveis e não deixa nenhum passar', () => {
    const feio = `ok${ESC}[2J${BIDI}fim${ZERO}`;
    const seguro = paraTerminal(feio);
    assert.equal(temControle(seguro), false);
    assert.match(seguro, /\\u\{1b\}/);
    assert.match(seguro, /\\u\{202e\}/);
    assert.match(seguro, /\\u\{200b\}/);
    assert.equal(paraTerminal('a\nb\tc'), 'a\\nb\\tc');
  });

  it('neutralizarControles mantém \\n e \\t, unifica CRLF e torna o resto visível', () => {
    const feio = `linha 1\r\nlinha${ESC}[2J 2\rlinha 3\t${BIDI}fim${ZERO}`;
    const limpo = neutralizarControles(feio);
    assert.equal(temControle(limpo), false);
    assert.equal(limpo.split('\n').length, 3, 'CRLF e CR viraram quebras de linha');
    assert.ok(limpo.includes('\t'));
    assert.match(limpo, /\\u\{1b\}\[2J/);
    assert.match(limpo, /\\u\{202e\}/);
    assert.equal(neutralizarControles('texto normal, acentuação ü 🙂'), 'texto normal, acentuação ü 🙂');
  });
});
