// Testes do validador do catálogo de Productivity Hacks (produtividade.mjs).
//   node --test academia/ferramentas/produtividade.test.mjs
// Usam um catálogo mínimo e sintético em pasta temporária, estragado de um jeito por vez, e conferem o catálogo real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DIR_PH, atualizarMapa, blocoHack, conferirBlocoHack, gerarMapaPorEtapa, lerCatalogo, validarProdutividade } from './produtividade.mjs';

const RAIZ_REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const temporarios = [];
afterEach(() => { while (temporarios.length) fs.rmSync(temporarios.pop(), { recursive: true, force: true }); });

const CODIGOS = { voz: 'VOZ', 'email-e-agenda': 'EMA', automacoes: 'AUT', telegram: 'TEL', ganhar: 'GAN' };

function dica(id, { titulo = 'Título da dica', sabia = '**Sabia que você pode** fazer algo **para melhorar** algo que você mede?', projeto = 'não', entra = 'qualquer momento', fontes = 'https://exemplo.com/a [verificado]', omitir = [] } = {}) {
  const campos = {
    'Faça:': '1) um; 2) dois; 3) três',
    'Tempo e custo:': '5 min · R$ 0',
    'Cuidado:': 'não envie segredos à nuvem',
    'Entra em:': entra,
    'Vira projeto?': projeto,
    'Fontes:': fontes,
  };
  return [`### ${id} · ${titulo}`, sabia, '', ...Object.entries(campos).filter(([k]) => !omitir.includes(k)).map(([k, v]) => `- **${k}** ${v}`), ''].join('\n');
}

const PROJETO = (id = 'PP-01', { dicas = 'PH-VOZ-01', criterios = 4, omitir = [] } = {}) => [
  `### ${id} · Projeto de exemplo`,
  ...[['Tempo:', '2 h'], ['O que se ganha:', 'tempo medido'], ['Dicas:', dicas], ['Riscos:', 'nenhum relevante']].filter(([k]) => !omitir.includes(k)).map(([k, v]) => `- **${k}** ${v}`),
  '- **Critérios de aceitação:**',
  ...Array.from({ length: criterios }, (_, i) => `  ${i + 1}. critério ${i + 1}`),
  '',
].join('\n');

/** Catálogo mínimo e válido: uma dica por trilha; a de voz leva ao PP-01. */
function montarCatalogo(ajustes = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-'));
  temporarios.push(raiz);
  const base = path.join(raiz, DIR_PH);
  fs.mkdirSync(path.join(base, 'trilhas'), { recursive: true });
  for (const [arquivo, codigo] of Object.entries(CODIGOS)) {
    const corpo = ajustes[arquivo] ?? dica(`PH-${codigo}-01`, codigo === 'VOZ' ? { projeto: 'sim: PP-01', entra: 'etapa 3' } : {});
    const projetosCitados = [...new Set(corpo.match(/(?<=- \*\*Vira projeto\?\*\* sim: )PP-\d{2}(?:, PP-\d{2})*/g)?.join(', ').match(/PP-\d{2}/g) ?? [])];
    const secaoProjetos = ajustes[`${arquivo}.projetos`] ?? (projetosCitados.length ? `## Projetos desta trilha\n${projetosCitados.map((p) => `- [${p}](../projetos-que-rendem.md) · x`).join('\n')}\n\n` : '');
    fs.writeFileSync(path.join(base, 'trilhas', `${arquivo}.md`), `# Trilha\n\n## Dicas\n\n${corpo}\n${secaoProjetos}## Fim\n`);
  }
  fs.writeFileSync(path.join(base, 'projetos-que-rendem.md'), `# Projetos\n\n${ajustes.projetos ?? PROJETO()}\n`);
  const linhasTabela = Object.keys(CODIGOS).map((arquivo) => {
    const corpo = ajustes[arquivo] ?? '';
    const projetosCitados = [...new Set(corpo.match(/PP-\d{2}/g) ?? (arquivo === 'voz' ? ['PP-01'] : []))];
    // conta só os títulos fora de cercas de código (como o validador de verdade), numa varredura linear
    let cerca = null;
    let nDicas = 0;
    for (const l of corpo.split('\n')) {
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(l);
      if (cerca) { if (m && m[1][0] === cerca[0] && m[1].length >= cerca.length) cerca = null; continue; }
      if (m) { cerca = m[1]; continue; }
      if (l.startsWith('### PH-')) nDicas += 1;
    }
    nDicas ||= 1;
    return `| [${arquivo}](trilhas/${arquivo}.md) | x | ${ajustes[`${arquivo}.n`] ?? nDicas} | ${projetosCitados.join(', ') || '-'} |`;
  }).join('\n');
  fs.writeFileSync(path.join(base, 'README.md'), `# Catálogo\n\n| Trilha | Cobre | Dicas | Projetos |\n|---|---|---|---|\n${ajustes.tabela ?? linhasTabela}\n\n<!-- mapa-por-etapa:inicio (gerado por: node academia/ferramentas/produtividade.mjs mapa --escrever) -->\n<!-- mapa-por-etapa:fim -->\n`);
  if (!ajustes.semMapa) atualizarMapa(raiz);
  return raiz;
}
const erros = (raiz) => validarProdutividade(raiz).map((e) => `${e.arquivo}: ${e.mensagem}`);

describe('catálogo sintético mínimo', () => {
  it('um catálogo bem formado não tem erros', () => {
    assert.deepEqual(erros(montarCatalogo()), []);
  });

  it('sem a pasta do catálogo não há o que validar (repositórios mínimos de teste)', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-vazio-'));
    temporarios.push(raiz);
    assert.deepEqual(validarProdutividade(raiz), []);
    assert.equal(lerCatalogo(raiz).existe, false);
  });
});

describe('cada dica', () => {
  it('campo ausente, repetido ou vazio é erro', () => {
    for (const campo of ['Faça:', 'Tempo e custo:', 'Cuidado:', 'Entra em:', 'Vira projeto?', 'Fontes:']) {
      const raiz = montarCatalogo({ telegram: dica('PH-TEL-01', { omitir: [campo] }) });
      assert.match(erros(raiz).join('\n'), new RegExp(`PH-TEL-01: falta o campo "- \\*\\*${campo.replace('?', '\\?')}\\*\\*"`), campo);
    }
    assert.match(erros(montarCatalogo({ telegram: `${dica('PH-TEL-01')}- **Cuidado:** de novo\n` })).join('\n'), /"Cuidado:" aparece mais de uma vez/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01').replace('- **Cuidado:** não envie segredos à nuvem', '- **Cuidado:**') })).join('\n'), /"Cuidado:" está vazio/);
  });

  it('o parágrafo "Sabia que você pode ... para melhorar ...?" é obrigatório e completo', () => {
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { sabia: 'Texto solto sem o formato.' }) })).join('\n'), /deve começar com "\*\*Sabia que você pode\*\*"/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { sabia: '**Sabia que você pode** fazer algo para melhorar algo?' }) })).join('\n'), /falta "\*\*para melhorar\*\*"/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { sabia: '**Sabia que você pode** fazer algo **para melhorar** algo.' }) })).join('\n'), /deve terminar com \?/);
  });

  it('o parágrafo pode quebrar em várias linhas', () => {
    const sabia = '**Sabia que você pode** fazer algo\nem duas linhas **para melhorar** o resultado?';
    assert.deepEqual(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { sabia }) })), []);
  });

  it('numeração: buraco, repetição e código de outra trilha', () => {
    assert.match(erros(montarCatalogo({ telegram: `${dica('PH-TEL-01')}\n${dica('PH-TEL-03')}` })).join('\n'), /PH-TEL-03: a numeração deve seguir PH-TEL-02/);
    assert.match(erros(montarCatalogo({ telegram: `${dica('PH-TEL-01')}\n${dica('PH-TEL-01')}` })).join('\n'), /id repetido: PH-TEL-01/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-GAN-05') })).join('\n'), /PH-GAN-05: o código da trilha telegram\.md é PH-TEL-NN/);
  });

  it('"Entra em": só qualquer momento, Missão 0 ou etapas de 1 a 16', () => {
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { entra: 'depois do almoço' }) })).join('\n'), /"Entra em" deve dizer/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { entra: 'etapa 17' }) })).join('\n'), /etapa fora de 1 a 16/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { entra: 'etapa 0' }) })).join('\n'), /etapa fora de 1 a 16/);
    assert.deepEqual(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { entra: 'Missão 0, etapa 2, etapa 9' }) })), []);
  });

  it('"Vira projeto?": sim exige um projeto que exista; não não pode citar projeto', () => {
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { projeto: 'sim' }) })).join('\n'), /diz sim, mas não cita o projeto/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { projeto: 'sim: PP-09' }) })).join('\n'), /o projeto PP-09 não existe/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { projeto: 'não, veja o PP-01' }) })).join('\n'), /diz não, mas cita PP-01/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { projeto: 'talvez' }) })).join('\n'), /deve começar com "não" ou "sim: PP-NN"/);
  });

  it('fontes: URL precisa de [verificado] ou [não verificado]; sem URL, só [opinião]', () => {
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { fontes: 'https://exemplo.com/a' }) })).join('\n'), /precisa da marca \[verificado\] ou \[não verificado\]/);
    assert.match(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { fontes: 'um blog que li' }) })).join('\n'), /precisa de uma URL https ou da marca \[opinião\]/);
    assert.deepEqual(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { fontes: 'https://exemplo.com/a [não verificado]' }) })), []);
    assert.deepEqual(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { fontes: 'minha experiência [opinião]' }) })), []);
  });

  it('um bloco de código dentro da dica não confunde a leitura dos campos', () => {
    const com = dica('PH-TEL-01').replace('- **Faça:** 1) um; 2) dois; 3) três', '- **Faça:** 1) rode:\n\n  ```bash\n  ### PH-FALSO-99 · isto está num bloco de código\n  - **Cuidado:** falso\n  ```\n')
      .replace('- **Cuidado:** não envie segredos à nuvem', '- **Cuidado:** não envie segredos à nuvem');
    assert.deepEqual(erros(montarCatalogo({ telegram: com })), []);
  });
});

describe('o que a revisão independente achou no validador', () => {
  it('título de dica ou de projeto fora do padrão vira erro (antes a dica sumia em silêncio)', () => {
    for (const ruim of ['### PH-TEL-02 - Dica', '### PH-TEL-02: Dica', '### PH-TEL-2 · Dica', '#### PH-TEL-02 · Dica']) {
      const raiz = montarCatalogo({ telegram: dica('PH-TEL-01') + '\n' + ruim + '\n' + '**Sabia que você pode** x **para melhorar** y?\n' });
      assert.match(erros(raiz).join('\n'), /fora do padrão|nível errado/, ruim);
    }
    const raiz = montarCatalogo({ projetos: PROJETO() + '\n### PP-02 - Projeto torto\n' });
    assert.match(erros(raiz).join('\n'), /título de projeto fora do padrão/);
  });

  it('cartão fora da seção "## Dicas" não conta como dica (e avisa)', () => {
    const raiz = montarCatalogo({ telegram: dica('PH-TEL-01') + '\n## Rascunho\n\n' + dica('PH-TEL-02') });
    assert.match(erros(raiz).join('\n'), /PH-TEL-02: a dica está fora da seção "## Dicas" \(está em "## Rascunho"\)/);
  });

  it('cada URL precisa da PRÓPRIA marca (antes bastava uma marca em qualquer lugar do campo)', () => {
    const raiz = montarCatalogo({ telegram: dica('PH-TEL-01', { fontes: 'https://a.example/x [verificado]; https://b.example/y' }) });
    assert.match(erros(raiz).join('\n'), /a fonte https:\/\/b\.example\/y precisa da marca/);
    assert.deepEqual(erros(montarCatalogo({ telegram: dica('PH-TEL-01', { fontes: 'https://a.example/x [verificado, espelho não oficial]; https://b.example/y [não verificado] (via resumo)' }) })), []);
  });

  it('cerca de código sem fechar, com crases ou til, não deixa o parser quadrático nem confuso', () => {
    const lixo = (String.fromCharCode(96).repeat(3) + 'a\n').repeat(20_000);
    const t0 = Date.now();
    const raiz = montarCatalogo({ telegram: dica('PH-TEL-01') + '\n' + lixo });
    erros(raiz);
    assert.ok(Date.now() - t0 < 10_000, 'levou ' + (Date.now() - t0) + ' ms');
    const comTil = dica('PH-TEL-01').replace('- **Faça:** 1) um; 2) dois; 3) três', '- **Faça:** 1) rode:\n\n~~~bash\n### PH-TEL-99 · dentro de uma cerca de til (na coluna 0, onde um título de verdade seria lido)\n~~~\n');
    assert.deepEqual(erros(montarCatalogo({ telegram: comTil })), []);
  });

  it('arquivo que é uma pasta, ou com BOM, vira mensagem de erro, não exceção', () => {
    const raiz = montarCatalogo();
    const voz = path.join(raiz, DIR_PH, 'trilhas', 'voz.md');
    fs.rmSync(voz);
    fs.mkdirSync(voz);
    assert.match(erros(raiz).join('\n'), /voz\.md: não consegui ler o arquivo/);
    const raiz2 = montarCatalogo();
    const tel = path.join(raiz2, DIR_PH, 'trilhas', 'telegram.md');
    fs.writeFileSync(tel, '\uFEFF' + fs.readFileSync(tel, 'utf8'));
    assert.deepEqual(erros(raiz2), []);
  });

  it('a seção "Projetos desta trilha" tem de bater com o que as dicas citam', () => {
    const sobrando = montarCatalogo({ 'voz.projetos': '## Projetos desta trilha\n- [PP-01](../projetos-que-rendem.md) · x\n- [PP-02](../projetos-que-rendem.md) · y\n\n' });
    assert.match(erros(sobrando).join('\n'), /lista PP-02, mas nenhuma dica da trilha o cita/);
    const faltando = montarCatalogo({ 'voz.projetos': '' });
    assert.match(erros(faltando).join('\n'), /não lista PP-01, que uma dica da trilha cita/);
  });

  it('a tabela de trilhas do README tem de bater com o catálogo (nº de dicas e projetos)', () => {
    assert.match(erros(montarCatalogo({ 'voz.n': 9 })).join('\n'), /diz 9 dicas para voz\.md, mas o catálogo tem 1/);
    const linhas = Object.keys(CODIGOS).map((a) => '| [' + a + '](trilhas/' + a + '.md) | x | 1 | ' + (a === 'voz' ? 'PP-01, PP-05' : '-') + ' |').join('\n');
    assert.match(erros(montarCatalogo({ tabela: linhas })).join('\n'), /lista os projetos \[PP-01, PP-05\] para voz\.md, mas as dicas citam \[PP-01\]/);
    const semLinha = '| [voz](trilhas/voz.md) | x | 1 | PP-01 |';
    assert.match(erros(montarCatalogo({ tabela: semLinha })).join('\n'), /não tem a linha de telegram\.md/);
  });

  it('"Vira projeto?" com PP-010 não é o PP-01 (id com mais dígitos): aponta para um projeto que não existe', () => {
    const raiz = montarCatalogo({ telegram: dica('PH-TEL-01', { projeto: 'sim: PP-010' }) });
    assert.match(erros(raiz).join('\n'), /o projeto PP-010 não existe|PH-TEL-01: "Vira projeto\?" diz sim, mas não cita/);
  });

  it('ids com mais dígitos não são confundidos (PH-TEL-012 não é PH-TEL-01) e comentário HTML não conta no bloco 15.6', () => {
    const dicas = new Map([['PH-TEL-01', {}]]);
    const licao = (bloco) => '### 15.6 Hack de produtividade\n\n' + bloco + '\n';
    assert.match(conferirBlocoHack(licao('**Sabia que você pode** X? PH-TEL-012'), dicas).join('\n'), /deve citar uma dica do catálogo/);
    assert.match(conferirBlocoHack(licao('**Sabia que você pode** X? <!-- PH-TEL-01 -->'), dicas).join('\n'), /deve citar uma dica do catálogo/);
    assert.deepEqual(conferirBlocoHack(licao('**Sabia que você pode** X? PH-TEL-01'), dicas), []);
  });
});

describe('projetos e a ligação com as dicas', () => {
  it('projeto sem critérios suficientes ou sem campos é erro', () => {
    assert.match(erros(montarCatalogo({ projetos: PROJETO('PP-01', { criterios: 3 }) })).join('\n'), /PP-01: os critérios de aceitação precisam de pelo menos 4 itens/);
    assert.match(erros(montarCatalogo({ projetos: PROJETO('PP-01', { omitir: ['Riscos:'] }) })).join('\n'), /PP-01: falta \(ou repete\) o campo "- \*\*Riscos:\*\*"/);
  });

  it('projeto órfão: nenhuma dica leva a ele', () => {
    const raiz = montarCatalogo({ projetos: `${PROJETO()}\n${PROJETO('PP-02', { dicas: 'PH-TEL-01' })}` });
    assert.match(erros(raiz).join('\n'), /PP-02: nenhuma dica leva a este projeto/);
  });

  it('as duas pontas precisam concordar: o projeto lista a dica E a dica cita o projeto', () => {
    // o projeto lista PH-TEL-01, mas PH-TEL-01 diz "não"
    assert.match(erros(montarCatalogo({ projetos: PROJETO('PP-01', { dicas: 'PH-VOZ-01, PH-TEL-01' }) })).join('\n'), /PP-01: a dica PH-TEL-01 não aponta de volta para este projeto/);
    // a dica cita o projeto, mas ele não a lista
    assert.match(erros(montarCatalogo({ projetos: PROJETO('PP-01', { dicas: 'PH-AUT-01' }) })).join('\n'), /PP-01: a dica PH-VOZ-01 cita este projeto, mas ele não a lista/);
    // dica que não existe
    assert.match(erros(montarCatalogo({ projetos: PROJETO('PP-01', { dicas: 'PH-VOZ-01, PH-VOZ-77' }) })).join('\n'), /a dica PH-VOZ-77 não existe/);
  });

  it('numeração dos projetos sem buracos', () => {
    const raiz = montarCatalogo({ projetos: `${PROJETO()}\n${PROJETO('PP-03', { dicas: 'PH-VOZ-01' })}` });
    assert.match(erros(raiz).join('\n'), /PP-03: a numeração deve seguir PP-02/);
  });
});

describe('mapa por etapa (gerado do catálogo)', () => {
  it('fica em dia depois de atualizarMapa; ao mudar uma dica, o validar avisa e diz como corrigir', () => {
    const raiz = montarCatalogo();
    assert.deepEqual(erros(raiz), []);
    const voz = path.join(raiz, DIR_PH, 'trilhas', 'voz.md');
    fs.writeFileSync(voz, fs.readFileSync(voz, 'utf8').replace('etapa 3', 'etapa 5'));
    assert.match(erros(raiz).join('\n'), /o mapa por etapa está desatualizado: rode `node academia\/ferramentas\/produtividade\.mjs mapa --escrever`/);
    atualizarMapa(raiz);
    assert.deepEqual(erros(raiz), []);
  });

  it('README sem as marcas é erro', () => {
    const raiz = montarCatalogo({ semMapa: true });
    fs.writeFileSync(path.join(raiz, DIR_PH, 'README.md'), '# Catálogo sem marcas\n');
    assert.match(erros(raiz).join('\n'), /faltam as marcas do mapa por etapa/);
  });

  it('ordem: qualquer momento, Missão 0 e depois as etapas em ordem numérica (a 10 vem depois da 9)', () => {
    const { dicas } = lerCatalogo(montarCatalogo({
      telegram: [dica('PH-TEL-01', { entra: 'etapa 10' }), dica('PH-TEL-02', { entra: 'etapa 9, Missão 0' }), dica('PH-TEL-03', { entra: 'qualquer momento' })].join('\n'),
    }));
    const titulos = [...gerarMapaPorEtapa(dicas).matchAll(/^- \*\*(.*?):\*\*/gm)].map((m) => m[1]);
    assert.deepEqual(titulos, ['Qualquer momento', 'Missão 0', 'Etapa 3', 'Etapa 9', 'Etapa 10']);
  });
});

describe('bloco 15.6 das lições', () => {
  const DICAS = new Map([['PH-TEL-01', {}], ['PH-GAN-03', {}]]);
  const licao = (bloco) => `## 15. Aplicação\n\n### 15.5 Calibragem\n\ntexto\n\n### 15.6 Hack de produtividade\n\n${bloco}\n`;

  it('bloco certo: Sabia que você pode + um id que existe', () => {
    assert.deepEqual(conferirBlocoHack(licao('**Sabia que você pode** X **para melhorar** Y?\n\n- Dica: PH-TEL-01 e PH-GAN-03'), DICAS), []);
  });

  it('sem bloco, sem a frase, sem id ou com id inexistente', () => {
    assert.deepEqual(conferirBlocoHack('## 15. Aplicação\n\n### 15.5 Calibragem\n', DICAS), ['falta o bloco 15.6 (Hack de produtividade)']);
    assert.match(conferirBlocoHack(licao('PH-TEL-01'), DICAS).join('\n'), /deve conter "\*\*Sabia que você pode\*\*"/);
    assert.match(conferirBlocoHack(licao('**Sabia que você pode** X?'), DICAS).join('\n'), /deve citar uma dica do catálogo/);
    assert.match(conferirBlocoHack(licao('**Sabia que você pode** X? PH-VOZ-77'), DICAS).join('\n'), /cita PH-VOZ-77, que não existe no catálogo/);
  });

  it('blocoHack lê só o 15.6 e ignora títulos dentro de blocos de código; o CRLF do Windows não atrapalha', () => {
    const t = licao('texto do bloco\n\n```md\n### 15.6 Falso\n```\n\n### 15.7 Outro\n\nfora').replace(/\n/g, '\r\n');
    const b = blocoHack(t);
    assert.match(b, /texto do bloco/);
    assert.ok(!b.includes('fora'));
    assert.equal(blocoHack('sem bloco'), '');
  });
});

describe('o catálogo real do repositório', () => {
  it('passa na validação, tem as cinco trilhas e as ligações dicas ↔ projetos', () => {
    assert.deepEqual(erros(RAIZ_REAL), []);
    const { dicas, projetos } = lerCatalogo(RAIZ_REAL);
    for (const codigo of Object.values(CODIGOS)) assert.ok([...dicas.keys()].some((id) => id.startsWith(`PH-${codigo}-`)), `trilha ${codigo} sem dicas`);
    assert.ok(dicas.size >= 40, `só ${dicas.size} dicas`);
    assert.equal(projetos.size, 11);
  });

  it('as lições prontas citam dicas do catálogo (a ligação que torna as dicas parte do currículo)', () => {
    const { dicas } = lerCatalogo(RAIZ_REAL);
    const pasta = path.join(RAIZ_REAL, 'academia', 'licoes');
    const licoes = fs.readdirSync(pasta).filter((n) => /^\d\d-/.test(n));
    assert.ok(licoes.length >= 3);
    for (const nome of licoes) assert.deepEqual(conferirBlocoHack(fs.readFileSync(path.join(pasta, nome, 'README.md'), 'utf8'), dicas), [], nome);
  });

  it('o README lista o mesmo número de dicas e de projetos que o catálogo tem', () => {
    const { dicas, projetos } = lerCatalogo(RAIZ_REAL);
    const readme = fs.readFileSync(path.join(RAIZ_REAL, DIR_PH, 'README.md'), 'utf8');
    assert.match(readme, new RegExp(`catálogo de ${dicas.size} dicas`), 'o texto de abertura do README diz outro número de dicas');
    assert.match(readme, new RegExp(`${projetos.size} projetos com critérios`), 'o texto de abertura do README diz outro número de projetos');
  });
});
