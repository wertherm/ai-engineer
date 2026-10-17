// Testes da ferramenta da Academia. Usam repositórios de mentira em pastas temporárias, com cópias dos documentos
// de regras reais (GAMIFICACAO.md, competencias.md, ROADMAP.md), para provar que as regras do texto são as que o código aplica.
//   node --test "academia/**/*.test.mjs"
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analisarAluno, carregarConfig, criarAluno, criarSessao, frontMatter, gerarRegistros, main, renderProgresso, renderRetomada,
  slug, tabela, validarLinks, validarTudo,
} from './academia.mjs';

const RAIZ_REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const temporarios = [];
afterEach(() => { while (temporarios.length) fs.rmSync(temporarios.pop(), { recursive: true, force: true }); });

/** Repositório de mentira com os documentos de regras reais. */
function montarRaiz() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'academia-'));
  temporarios.push(raiz);
  fs.mkdirSync(path.join(raiz, 'academia', 'alunos'), { recursive: true });
  for (const f of ['GAMIFICACAO.md', 'competencias.md', 'ROADMAP.md']) fs.copyFileSync(path.join(RAIZ_REAL, 'academia', f), path.join(raiz, 'academia', f));
  return raiz;
}

function aluno(raiz, slugAluno, { nome = slugAluno, compartilhar = 'nao' } = {}) {
  const dir = path.join(raiz, 'academia', 'alunos', slugAluno);
  fs.mkdirSync(path.join(dir, 'sessoes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'perfil.md'), `---\nslug: ${slugAluno}\nnome: ${nome}\ncompartilhar_xp: ${compartilhar}\n---\n\n# Perfil\n`);
  return dir;
}

function sessao(dir, { aluno: a, data = '2026-10-18', numero = 1, etapa = 0, status = 'em-andamento', retomada = 'nao', atividades = [], competencias = [], checkpoints = [], pendencias = ['nenhuma'], proxima = 'Fazer algo.', crlf = false }) {
  const linhas = (rows) => rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  const texto = `---
aluno: ${a}
data: ${data}
sessao: ${numero}
etapa: ${etapa}
status_etapa: ${status}
retomada: ${retomada}
---

# Sessão

## Resumo

Resumo da sessão.

## Atividades

| id | tipo | tentativa | resultado | evidência | XP |
|---|---|---|---|---|---|
${linhas(atividades)}

## Competências

| id | nível | evidência |
|---|---|---|
${linhas(competencias)}

## Checkpoints

| id | resultado | evidência |
|---|---|---|
${linhas(checkpoints)}

## Feedback

Bom trabalho.

## Pendências

${pendencias.map((p) => `- ${p}`).join('\n')}

## Próxima missão

${proxima}
`;
  const nome = `${data}-s${String(numero).padStart(2, '0')}.md`;
  fs.writeFileSync(path.join(dir, 'sessoes', nome), crlf ? texto.replace(/\n/g, '\r\n') : texto);
  return nome;
}

const EVID = 'evidencia-registrada-na-conversa';
const missao0 = (a, extra = {}) => ({ aluno: a, numero: 1, etapa: 0, status: 'concluida', atividades: [['E00-quiz', 'quiz', 1, 'aprovado', EVID, 10], ['E00-lab', 'laboratorio', 1, 'aprovado', EVID, 30]], ...extra });
const mensagens = (r) => r.erros.map((e) => e.mensagem);

describe('configuração lida dos documentos', () => {
  it('o repositório real tem 16 etapas, 24 competências, 20 conquistas e as regras de XP da especificação', () => {
    const { erros, config } = carregarConfig(RAIZ_REAL);
    assert.deepEqual(erros, []);
    assert.equal(config.etapas.length, 16);
    assert.equal(config.competencias.length, 24);
    assert.equal(config.conquistas.length, 20);
    assert.deepEqual(config.xp, { quiz: 10, laboratorio: 30, explicacao: 15, revisao: 10, opcional: 20 });
    assert.deepEqual(config.niveis.map((n) => n.nome), ['Aprendiz', 'Construtor', 'Investigador', 'Engenheiro']);
    assert.deepEqual(config.checkpoints.map((k) => k.apos), [3, 8, 11, 14, 16]);
  });

  it('o conteúdo real do repositório passa na validação completa', () => {
    const { erros } = validarTudo(RAIZ_REAL);
    assert.deepEqual(erros, []);
  });

  it('detecta regra de conquista desconhecida e competência fora do catálogo', () => {
    const raiz = montarRaiz();
    const g = path.join(raiz, 'academia', 'GAMIFICACAO.md');
    fs.writeFileSync(g, fs.readFileSync(g, 'utf8').replace('`cp:CP1`', '`magia:CP1`').replace('`comp:C19>=2`', '`comp:C99>=2`'));
    const { erros } = carregarConfig(raiz);
    assert.ok(erros.some((e) => /regra desconhecida/.test(e.mensagem)));
    assert.ok(erros.some((e) => /competência inexistente \(C99\)/.test(e.mensagem)));
  });
});

describe('XP e evidências', () => {
  it('concede XP a atividades aprovadas com evidência e desbloqueia a conquista', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), missao0('ana'));
    const { config } = carregarConfig(raiz);
    const r = analisarAluno(raiz, 'ana', config);
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.xp, 40);
    assert.ok(r.estado.conquistas.has('A01'));
    assert.equal(r.estado.etapaAtual, 1);
    assert.equal(r.estado.nivel.nome, 'Aprendiz');
  });

  it('rejeita XP sem evidência, XP duplicado, valor fora da tabela e XP em tentativa reprovada', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', numero: 1, etapa: 1, atividades: [['E01-quiz', 'quiz', 1, 'aprovado', '-', 10], ['E01-lab', 'laboratorio', 1, 'reprovado', EVID, 30], ['E01-explicacao', 'explicacao', 1, 'aprovado', EVID, 99]] });
    sessao(dir, { aluno: 'ana', numero: 2, data: '2026-10-19', etapa: 1, atividades: [['E01-explicacao', 'explicacao', 2, 'aprovado', EVID, 15], ['E01-explicacao', 'explicacao', 3, 'aprovado', EVID, 15]] });
    const { config } = carregarConfig(raiz);
    const m = mensagens(analisarAluno(raiz, 'ana', config)).join('\n');
    assert.match(m, /E01-quiz: XP sem evidência/);
    assert.match(m, /E01-lab: XP só pode ser concedido a uma atividade aprovada/);
    assert.match(m, /E01-explicacao: XP 99 não confere com a tabela/);
    assert.match(m, /E01-explicacao: XP já concedido antes/);
  });

  it('exige que o id e o tipo combinem e que a aprovação inicial tenha XP', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), { aluno: 'ana', etapa: 1, atividades: [['E01-lab', 'quiz', 1, 'aprovado', EVID, 10], ['E01-quiz', 'quiz', 1, 'aprovado', EVID, 0], ['X1-quiz', 'quiz', 1, 'aprovado', EVID, 10]] });
    const { config } = carregarConfig(raiz);
    const m = mensagens(analisarAluno(raiz, 'ana', config)).join('\n');
    assert.match(m, /tipo "quiz" não confere com o id/);
    assert.match(m, /aprovada pela primeira vez, mas sem XP/);
    assert.match(m, /id de atividade inválido/);
  });

  it('aceita nota objetiva curta como evidência, mas não textos minúsculos', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), { aluno: 'ana', etapa: 1, atividades: [['E01-quiz', 'quiz', 1, 'aprovado', 'ok no teste', 10], ['E01-explicacao', 'explicacao', 1, 'aprovado', 'ok', 15]] });
    const { config } = carregarConfig(raiz);
    const m = mensagens(analisarAluno(raiz, 'ana', config));
    assert.ok(!m.some((x) => x.startsWith('E01-quiz')), m.join('\n'));
    assert.ok(m.some((x) => x.startsWith('E01-explicacao: XP sem evidência')));
  });

  it('exige que a evidência apontada por caminho exista', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', etapa: 0, atividades: [['E00-quiz', 'quiz', 1, 'aprovado', '`entregas/etapa-00/diagnostico.md`', 10]] });
    const { config } = carregarConfig(raiz);
    assert.match(mensagens(analisarAluno(raiz, 'ana', config)).join('\n'), /evidência não encontrada: entregas\/etapa-00\/diagnostico.md/);
    fs.mkdirSync(path.join(dir, 'entregas', 'etapa-00'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'entregas', 'etapa-00', 'diagnostico.md'), 'respostas');
    assert.deepEqual(analisarAluno(raiz, 'ana', config).erros, []);
  });
});

describe('etapas, competências, checkpoints e níveis', () => {
  it('não deixa concluir uma etapa sem quiz e laboratório aprovados', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), { aluno: 'ana', etapa: 1, status: 'concluida', atividades: [['E01-quiz', 'quiz', 1, 'aprovado', EVID, 10]] });
    const { config } = carregarConfig(raiz);
    assert.match(mensagens(analisarAluno(raiz, 'ana', config)).join('\n'), /etapa 1 marcada como concluída sem E01-lab aprovado/);
  });

  it('valida competências: id existente, nível de 0 a 3 e evidência', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), { aluno: 'ana', etapa: 1, competencias: [['C99', 2, EVID], ['C01', 5, EVID], ['C02', 2, '-']] });
    const { config } = carregarConfig(raiz);
    const m = mensagens(analisarAluno(raiz, 'ana', config)).join('\n');
    assert.match(m, /competência inexistente: C99/);
    assert.match(m, /C01: nível deve ser de 0 a 3/);
    assert.match(m, /C02: nível 2 sem evidência/);
  });

  it('o nível é o das competências: XP alto sem checkpoint não promove, e CP exige a fase no nível 2', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, missao0('ana'));
    for (const n of [1, 2, 3]) {
      const nn = `0${n}`;
      sessao(dir, { aluno: 'ana', numero: n + 1, data: `2026-10-${18 + n}`, etapa: n, status: 'concluida', atividades: [[`E${nn}-quiz`, 'quiz', 1, 'aprovado', EVID, 10], [`E${nn}-lab`, 'laboratorio', 1, 'aprovado', EVID, 30], [`E${nn}-explicacao`, 'explicacao', 1, 'aprovado', EVID, 15]] });
    }
    const { config } = carregarConfig(raiz);
    let r = analisarAluno(raiz, 'ana', config);
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.xp, 40 + 3 * 55);
    assert.equal(r.estado.nivel.nome, 'Aprendiz', 'XP >= 150 mas falta o CP1');
    assert.deepEqual(r.estado.faltaParaProximo, { xp: 0, checkpoints: ['CP1'] });

    sessao(dir, { aluno: 'ana', numero: 5, data: '2026-10-25', etapa: 3, checkpoints: [['CP1', 'aprovado', EVID]] });
    assert.match(mensagens(analisarAluno(raiz, 'ana', config)).join('\n'), /CP1: exige todas as competências da fase 1 no nível 2/);

    fs.rmSync(path.join(dir, 'sessoes', '2026-10-25-s05.md'));
    sessao(dir, { aluno: 'ana', numero: 5, data: '2026-10-25', etapa: 3, competencias: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07'].map((c) => [c, 2, EVID]), checkpoints: [['CP1', 'aprovado', EVID]] });
    r = analisarAluno(raiz, 'ana', config);
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.nivel.nome, 'Construtor');
    for (const a of ['A02', 'A03', 'A04', 'A05']) assert.ok(r.estado.conquistas.has(a), a);
  });

  it('a competência registrada é a da evidência mais recente (pode cair sem perder XP nem conquistas)', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', numero: 1, etapa: 1, competencias: [['C01', 2, EVID], ['C02', 2, EVID], ['C03', 2, EVID]] });
    sessao(dir, { aluno: 'ana', numero: 2, data: '2026-10-19', etapa: 1, competencias: [['C01', 1, EVID]] });
    const { config } = carregarConfig(raiz);
    const { estado } = analisarAluno(raiz, 'ana', config);
    assert.equal(estado.competencias.get('C01').nivel, 1);
    assert.ok(estado.conquistas.has('A02'), 'conquista não é revogada');
  });
});

describe('revisão espaçada e retomada', () => {
  function cenario() {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', numero: 1, etapa: 1, status: 'concluida', atividades: [['E01-quiz', 'quiz', 1, 'aprovado', EVID, 10], ['E01-lab', 'laboratorio', 1, 'aprovado', EVID, 30]] });
    return { raiz, dir, config: carregarConfig(raiz).config };
  }

  it('sugere a 1ª revisão depois de 1 sessão e a 2ª só depois de mais 3 (conta sessões, não dias)', () => {
    const { raiz, dir, config } = cenario();
    assert.deepEqual(analisarAluno(raiz, 'ana', config).estado.revisoesSugeridas, [], 'ainda na própria sessão');
    sessao(dir, { aluno: 'ana', numero: 2, data: '2027-03-01', etapa: 2, retomada: 'sim' });
    let est = analisarAluno(raiz, 'ana', config).estado;
    assert.deepEqual(est.revisoesSugeridas.map((r) => [r.etapa, r.numero]), [[1, 1]]);
    assert.equal(est.xp, 40, 'meses de pausa não tiram XP');
    assert.ok(est.conquistas.has('A19'), 'voltar de uma pausa rende conquista');
    sessao(dir, { aluno: 'ana', numero: 3, data: '2027-03-02', etapa: 2, atividades: [['R01-1', 'revisao', 1, 'aprovado', EVID, 10]] });
    est = analisarAluno(raiz, 'ana', config).estado;
    assert.deepEqual(est.revisoesSugeridas, []);
    assert.equal(est.xp, 50);
    for (const [n, d] of [[4, '2027-03-03'], [5, '2027-03-04']]) sessao(dir, { aluno: 'ana', numero: n, data: d, etapa: 2 });
    assert.deepEqual(analisarAluno(raiz, 'ana', config).estado.revisoesSugeridas.map((r) => r.numero), [2]);
  });

  it('não aceita revisão de etapa ainda não concluída', () => {
    const { raiz, dir, config } = cenario();
    sessao(dir, { aluno: 'ana', numero: 2, data: '2026-10-19', etapa: 2, atividades: [['R02-1', 'revisao', 1, 'aprovado', EVID, 10]] });
    assert.match(mensagens(analisarAluno(raiz, 'ana', config)).join('\n'), /R02-1: revisão de uma etapa que ainda não foi concluída/);
  });

  it('aceita arquivos de sessão com quebras de linha CRLF (Git no Windows)', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), missao0('ana', { crlf: true }));
    const { config } = carregarConfig(raiz);
    const r = analisarAluno(raiz, 'ana', config);
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.xp, 40);
  });
});

describe('alunos independentes', () => {
  it('o progresso de um aluno não altera o do outro', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), missao0('ana'));
    aluno(raiz, 'bia');
    const { config } = carregarConfig(raiz);
    assert.equal(analisarAluno(raiz, 'ana', config).estado.xp, 40);
    const bia = analisarAluno(raiz, 'bia', config);
    assert.equal(bia.estado.xp, 0);
    assert.equal(bia.estado.conquistas.size, 0);
    assert.equal(bia.estado.etapaAtual, 0);
  });

  it('rejeita um relatório gravado na pasta de outro aluno e perfil com slug errado', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), missao0('bia'));
    fs.writeFileSync(path.join(raiz, 'academia', 'alunos', 'ana', 'perfil.md'), '---\nslug: outra\nnome: X\ncompartilhar_xp: talvez\n---\n');
    const { config } = carregarConfig(raiz);
    const m = mensagens(analisarAluno(raiz, 'ana', config)).join('\n');
    assert.match(m, /aluno "bia" não confere com a pasta "ana"/);
    assert.match(m, /slug "outra" não confere/);
    assert.match(m, /compartilhar_xp/);
  });

  it('o PROGRESS.md só mostra o XP de quem compartilha, em ordem alfabética e sem ranking', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'zeca', { compartilhar: 'sim' }), missao0('zeca'));
    sessao(aluno(raiz, 'ana'), missao0('ana', { atividades: [['E00-quiz', 'quiz', 1, 'aprovado', EVID, 10], ['E00-lab', 'laboratorio', 1, 'aprovado', EVID, 30]] }));
    const { config } = carregarConfig(raiz);
    const estados = ['ana', 'zeca'].map((a) => analisarAluno(raiz, a, config).estado);
    const md = renderProgresso(estados, config);
    assert.ok(md.indexOf('| [ana]') < md.indexOf('| [zeca]'));
    assert.match(md, /\| \[ana\]\([^)]*\) \| Aprendiz \|[^|]*\|[^|]*\| — \|/);
    assert.match(md, /\| \[zeca\]\([^)]*\) \| Aprendiz \|[^|]*\|[^|]*\| 40 \|/);
  });
});

describe('arquivos gerados e comandos', () => {
  it('gerarRegistros cria retomada.md e PROGRESS.md e a checagem detecta desatualização', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), missao0('ana'));
    const { config } = carregarConfig(raiz);
    assert.ok(gerarRegistros(raiz, config, { somenteChecar: true }).erros.length >= 2, 'ainda não gerados');
    gerarRegistros(raiz, config);
    assert.deepEqual(gerarRegistros(raiz, config, { somenteChecar: true }).erros, []);
    const retomada = fs.readFileSync(path.join(raiz, 'academia', 'alunos', 'ana', 'retomada.md'), 'utf8');
    assert.match(retomada, /\*\*Nível:\*\* Aprendiz · \*\*XP:\*\* 40/);
    assert.match(retomada, /- \[x\] \*\*Bússola\*\*/);
    fs.appendFileSync(path.join(raiz, 'academia', 'alunos', 'ana', 'retomada.md'), '\nedição manual\n');
    assert.match(gerarRegistros(raiz, config, { somenteChecar: true }).erros[0].mensagem, /desatualizado/);
  });

  it('preserva o texto escrito à mão em PROGRESS.md fora das marcas', () => {
    const raiz = montarRaiz();
    aluno(raiz, 'ana');
    const { config } = carregarConfig(raiz);
    gerarRegistros(raiz, config);
    const arq = path.join(raiz, 'academia', 'PROGRESS.md');
    fs.writeFileSync(arq, fs.readFileSync(arq, 'utf8').replace('# Progresso', '# Progresso\n\nNota manual.'));
    gerarRegistros(raiz, config);
    assert.match(fs.readFileSync(arq, 'utf8'), /Nota manual\./);
  });

  it('sessao cria o próximo arquivo numerado sem sobrescrever; novo-aluno cria o perfil', () => {
    const raiz = montarRaiz();
    const { config } = carregarConfig(raiz);
    assert.equal(criarAluno(raiz, config, 'caio', 'Caio'), 'academia/alunos/caio');
    assert.throws(() => criarAluno(raiz, config, 'caio', 'Caio'), /já existe/);
    assert.throws(() => criarAluno(raiz, config, 'Nome Ruim', 'X'), /slug inválido/);
    assert.equal(criarSessao(raiz, config, 'caio', { data: '2026-10-20' }), 'academia/alunos/caio/sessoes/2026-10-20-s01.md');
    const r = analisarAluno(raiz, 'caio', config);
    assert.deepEqual(r.erros, [], 'a sessão recém-criada já é válida');
    assert.equal(criarSessao(raiz, config, 'caio', { data: '2026-10-20' }), 'academia/alunos/caio/sessoes/2026-10-20-s02.md', 'o número avança; nada é sobrescrito');
    assert.throws(() => criarSessao(raiz, config, 'ninguem'), /não encontrado/);
  });

  it('main devolve códigos de saída coerentes', () => {
    const raiz = montarRaiz();
    const silencio = console.log; const silencioErr = console.error;
    console.log = () => {}; console.error = () => {};
    try {
      assert.equal(main(['ajuda'], raiz), 0);
      assert.equal(main(['inexistente'], raiz), 2);
      assert.equal(main(['novo-aluno', 'dani', 'Dani'], raiz), 0);
      assert.equal(main(['novo-aluno'], raiz), 1);
      assert.equal(main(['progresso', '--check'], raiz), 0);
      assert.equal(main(['sessao', 'dani', '--etapa', '99'], raiz), 1);
      assert.equal(main(['sessao', 'dani', '--data', 'ontem'], raiz), 1);
      assert.equal(main(['sessao', 'dani', '--etapa', '1', '--data', '2026-10-20'], raiz), 0);
    } finally { console.log = silencio; console.error = silencioErr; }
  });
});

describe('validação de links e utilitários de Markdown', () => {
  it('detecta arquivo e âncora inexistentes e ignora links externos e blocos de código', () => {
    const raiz = montarRaiz();
    fs.writeFileSync(path.join(raiz, 'academia', 'a.md'), [
      '# Título A', '', '## Seção Dois', '',
      '[ok](b.md) [ok2](b.md#parte-um) [ok3](#seção-dois) [externo](https://example.com/x) [mail](mailto:a@b.c)',
      '[quebrado](nao-existe.md) [âncora ruim](b.md#nao-existe)',
      '```', '[dentro de código](nada.md)', '```', '`[inline](nada2.md)`',
    ].join('\n'));
    fs.writeFileSync(path.join(raiz, 'academia', 'b.md'), '# B\n\n## Parte um\n');
    // a cópia dos documentos reais no repositório de mentira tem links quebrados; só interessam os de a.md
    const msgs = validarLinks(raiz).filter((e) => e.arquivo.startsWith('academia/a.md')).map((e) => e.mensagem);
    assert.deepEqual(msgs, ['link quebrado: nao-existe.md', 'âncora inexistente: b.md#nao-existe']);
  });

  it('tabela, frontMatter e slug', () => {
    assert.deepEqual(tabela(['texto', '| Nível | XP mínimo |', '|---|---|', '| `a\\|b` | 3 |', '', '| x | y |']), [{ nivel: '`a|b`', xp_minimo: '3' }]);
    assert.equal(tabela(['sem tabela']), null);
    assert.deepEqual(frontMatter('---\na: 1\nb: "dois"\n---\ncorpo').dados, { a: '1', b: 'dois' });
    assert.equal(slug('6. Exemplos práticos'), '6-exemplos-práticos');
    assert.equal(slug('Etapa 2 · APIs, TypeScript'), 'etapa-2--apis-typescript');
    assert.equal(slug('`XP` e [níveis](x.md)'), 'xp-e-níveis');
  });

  it('renderRetomada lista pendências de atividades reprovadas e é determinística', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), { aluno: 'ana', etapa: 1, atividades: [['E01-lab', 'laboratorio', 1, 'reprovado', EVID, 0]], pendencias: ['refazer o CA3'], proxima: 'Corrigir a inclinação.' });
    const { config } = carregarConfig(raiz);
    const est = analisarAluno(raiz, 'ana', config).estado;
    const md = renderRetomada(est, config);
    assert.match(md, /- refazer o CA3/);
    assert.match(md, /Atividade `E01-lab` sem aprovação \(1 tentativa, última: reprovado\)/);
    assert.match(md, /Corrigir a inclinação\./);
    assert.match(md, /## Último feedback\n\n> Bom trabalho\./);
    assert.equal(renderRetomada(est, config), md);
  });
});
