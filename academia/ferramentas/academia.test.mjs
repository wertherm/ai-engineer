// Testes da ferramenta da Academia. Usam repositórios de mentira em pastas temporárias, com cópias dos documentos
// de regras reais (GAMIFICACAO.md, competencias.md, ROADMAP.md), para provar que as regras do texto são as que o código aplica.
//   node --test "academia/**/*.test.mjs"
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analisarAluno, carregarConfig, criarAluno, criarSessao, frontMatter, gerarRegistros, inteiro, main, montarKit, renderProgresso,
  renderRetomada, secoes, slug, tabela, validarLinks, validarSegredos, validarTudo,
} from './academia.mjs';
import { acharSegredos, enderecoSeguro, limparSaida } from './comum.mjs';

const RAIZ_REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const temporarios = [];
afterEach(() => { while (temporarios.length) fs.rmSync(temporarios.pop(), { recursive: true, force: true }); });

const novoTmp = (prefixo) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
  temporarios.push(d);
  return d;
};

/** Repositório de mentira com os documentos de regras reais. */
function montarRaiz() {
  const raiz = novoTmp('academia-');
  fs.mkdirSync(path.join(raiz, 'academia', 'alunos'), { recursive: true });
  for (const f of ['GAMIFICACAO.md', 'competencias.md', 'ROADMAP.md']) fs.copyFileSync(path.join(RAIZ_REAL, 'academia', f), path.join(raiz, 'academia', f));
  return raiz;
}

/** Cópia completa do repositório real (sem .git), para os testes que validam o conjunto. */
function copiarRepo() {
  const raiz = novoTmp('academia-repo-');
  fs.cpSync(RAIZ_REAL, raiz, { recursive: true, filter: (origem) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(origem) });
  return raiz;
}

/** Configuração real com todas as etapas "prontas" (os testes de regras de XP usam etapas além da 1). */
function configProntas(raiz) {
  const { erros, config } = carregarConfig(raiz);
  assert.deepEqual(erros, []);
  config.etapas.forEach((e) => { e.status = 'pronta'; });
  return config;
}

function aluno(raiz, slugAluno, { nome = slugAluno, compartilhar = 'nao' } = {}) {
  const dir = path.join(raiz, 'academia', 'alunos', slugAluno);
  fs.mkdirSync(path.join(dir, 'sessoes'), { recursive: true });
  const preenchido = 'Texto do aluno com mais de vinte letras para valer como preenchido.';
  fs.writeFileSync(path.join(dir, 'perfil.md'), `---\nslug: ${slugAluno}\nnome: ${nome}\ncompartilhar_xp: ${compartilhar}\nritmo: 3 horas por semana\n---\n\n# Perfil\n\n## Objetivo com o curso\n\n${preenchido}\n\n## Ponto de partida\n\n${preenchido}\n\n## Preferências de estudo\n\n${preenchido}\n\n## Ambiente\n\n${preenchido}\n`);
  return dir;
}

/** Cria um arquivo de evidência no aluno e devolve a célula da tabela que o cita. */
function evid(dir, rel = 'entregas/etapa-00/evidencia.md') {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'Conteúdo de evidência suficiente para passar do tamanho mínimo.\n');
  return `\`${rel}\``;
}

function sessao(dir, { aluno: a, data = '2026-10-18', numero = 1, etapa = 0, status = 'em-andamento', retomada = 'nao', atividades = [], competencias = [], checkpoints = [], pendencias = ['nenhuma'], proxima = 'Fazer algo.', crlf = false, bom = false, nome }) {
  const linhas = (rows) => rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  let texto = `---
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
  if (crlf) texto = texto.replace(/\n/g, '\r\n');
  if (bom) texto = `\uFEFF${texto}`;
  const arquivo = nome ?? `${data}-s${String(numero).padStart(2, '0')}.md`;
  fs.mkdirSync(path.join(dir, 'sessoes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sessoes', arquivo), texto);
  return arquivo;
}

const NOTA = 'nota objetiva registrada';
const mensagens = (r) => r.erros.map((e) => e.mensagem);
const juntas = (r) => mensagens(r).join('\n');

/** Linhas de atividade de uma etapa concluída (quiz + lab), com evidência real. */
function etapaCompleta(dir, n, { explicacao = false } = {}) {
  const nn = String(n).padStart(2, '0');
  const rows = [
    [`E${nn}-quiz`, 'quiz', 1, 'aprovado', evid(dir, `entregas/etapa-${nn}/quiz.md`), 10],
    [`E${nn}-lab`, 'laboratorio', 1, 'aprovado', evid(dir, `entregas/etapa-${nn}/relatorio.md`), 30],
  ];
  if (explicacao) rows.push([`E${nn}-explicacao`, 'explicacao', 1, 'aprovado', evid(dir, `entregas/etapa-${nn}/explicacao.md`), 15]);
  return rows;
}

describe('configuração lida dos documentos', () => {
  it('o repositório real tem 16 etapas, 24 competências, 20 conquistas e as regras de XP da especificação', () => {
    const { erros, config } = carregarConfig(RAIZ_REAL);
    assert.deepEqual(erros, []);
    assert.equal(config.etapas.length, 16);
    assert.equal(config.competencias.length, 24);
    assert.equal(config.conquistas.length, 20);
    assert.deepEqual(config.xp, { quiz: 10, laboratorio: 30, explicacao: 15, revisao: 10, opcional: 20 });
    assert.deepEqual(config.niveis.map((n) => n.nome), ['Aprendiz', 'Construtor', 'Investigador', 'Engenheiro']);
    assert.deepEqual(config.niveis.map((n) => n.checkpoints.length), [0, 1, 2, 5]);
    assert.deepEqual(config.checkpoints.map((k) => k.apos), [3, 8, 11, 14, 16]);
    assert.deepEqual(config.revisoes, [1, 3, 7, 15]);
  });

  it('o conteúdo real do repositório passa na validação completa (inclui registros gerados atualizados)', () => {
    const { erros } = validarTudo(RAIZ_REAL);
    assert.deepEqual(erros, []);
  });

  it('detecta regra de conquista desconhecida, competência fora do catálogo e checkpoint mal escrito', () => {
    const raiz = montarRaiz();
    const g = path.join(raiz, 'academia', 'GAMIFICACAO.md');
    fs.writeFileSync(g, fs.readFileSync(g, 'utf8').replace('`cp:CP1`', '`magia:CP1`').replace('`comp:C19>=2`', '`comp:C99>=2`')
      .replace('| Investigador | 450 | CP1, CP2 |', '| Investigador | 450 | CP 1 e CP2 |'));
    const msgs = carregarConfig(raiz).erros.map((e) => e.mensagem).join('\n');
    assert.match(msgs, /regra desconhecida/);
    assert.match(msgs, /competência inexistente \(C99\)/);
    assert.match(msgs, /mal escrito/);
  });

  it('arquivo de regras ausente gera um único erro', () => {
    const raiz = montarRaiz();
    fs.rmSync(path.join(raiz, 'academia', 'GAMIFICACAO.md'));
    const msgs = carregarConfig(raiz).erros.filter((e) => /arquivo não encontrado/.test(e.mensagem));
    assert.equal(msgs.length, 1);
  });
});

describe('XP e evidências', () => {
  it('concede XP a atividades aprovadas com arquivo de evidência e desbloqueia a conquista', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', etapa: 0, status: 'concluida', atividades: etapaCompleta(dir, 0).map((r) => [r[0] === 'E00-lab' ? 'E00-lab' : r[0], ...r.slice(1)]) });
    const { config } = carregarConfig(raiz);
    const r = analisarAluno(raiz, 'ana', config);
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.xp, 40);
    assert.ok(r.estado.conquistas.has('A01'));
    assert.equal(r.estado.etapaAtual, 1);
    assert.equal(r.estado.nivel.nome, 'Aprendiz');
    assert.equal(r.estado.proximaSessao, 2);
  });

  it('linha com erro NÃO soma XP (a raiz do XP inventado) e aponta todos os defeitos', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', etapa: 0, atividades: [
      ['E00-quiz', 'quiz', 1, 'aprovado', '-', 500],
      ['E00-lab', 'laboratorio', 1, 'reprovado', evid(dir), 30],
      ['E00-explicacao', 'explicacao', 1, 'aprovado', evid(dir, 'entregas/e.md'), 99],
    ] });
    const { config } = carregarConfig(raiz);
    const r = analisarAluno(raiz, 'ana', config);
    const m = juntas(r);
    assert.equal(r.estado.xp, 0, 'nenhuma das três linhas é válida');
    assert.match(m, /E00-quiz: XP 500 não confere com a tabela/);
    assert.match(m, /E00-quiz: XP sem evidência/);
    assert.match(m, /E00-lab: XP só pode ser concedido a uma atividade aprovada/);
    assert.match(m, /E00-explicacao: XP 99 não confere com a tabela/);
  });

  it('rejeita XP duplicado, inclusive por ids equivalentes (zeros à esquerda) e opcional além do limite', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    const config = configProntas(raiz);
    const ev = evid(dir, 'entregas/etapa-01/opcional.md');
    sessao(dir, { aluno: 'ana', etapa: 1, atividades: [
      ['E01-opcional-1', 'opcional', 1, 'aprovado', ev, 20],
      ['E01-opcional-01', 'opcional', 1, 'aprovado', ev, 20],
      ['E01-opcional-4', 'opcional', 1, 'aprovado', ev, 20],
      ['E01-opcional-1', 'opcional', 2, 'aprovado', ev, 20],
    ] });
    const r = analisarAluno(raiz, 'ana', config);
    assert.equal(r.estado.xp, 20, 'só o primeiro opcional-1 vale');
    assert.match(juntas(r), /id de atividade inválido: "E01-opcional-01"/);
    assert.match(juntas(r), /só existem 3 desafios opcionais por etapa/);
    assert.match(juntas(r), /E01-opcional-1: XP já concedido antes/);
    assert.equal(r.estado.contagens.opcionais, 1);
  });

  it('exige que o id e o tipo combinem e que o resultado e a tentativa sejam válidos', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    const config = configProntas(raiz);
    sessao(dir, { aluno: 'ana', etapa: 1, atividades: [
      ['E01-lab', 'quiz', 1, 'aprovado', evid(dir), 10],
      ['X1-quiz', 'quiz', 1, 'aprovado', evid(dir), 10],
      ['E01-quiz', 'quiz', 0, 'aprovado', evid(dir), 10],
      ['E01-explicacao', 'explicacao', 1, 'talvez', evid(dir), 15],
      ['E99-quiz', 'quiz', 1, 'aprovado', evid(dir), 10],
    ] });
    const m = juntas(analisarAluno(raiz, 'ana', config));
    assert.match(m, /tipo "quiz" não confere com o id/);
    assert.match(m, /id de atividade inválido: "X1-quiz"/);
    assert.match(m, /tentativa deve ser um inteiro >= 1/);
    assert.match(m, /resultado deve ser aprovado, parcial, reprovado/);
    assert.match(m, /E99-quiz: etapa inexistente/);
  });

  it('a evidência só vale se for um arquivo existente DENTRO da pasta do aluno', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    const bia = aluno(raiz, 'bia');
    evid(bia, 'entregas/etapa-00/relatorio.md');
    fs.writeFileSync(path.join(dir, 'entregas-vazia.md'), 'curto');
    const { config } = carregarConfig(raiz);
    const tenta = (celula, id = 'E00-quiz', tipo = 'quiz', xp = 10) => {
      fs.rmSync(path.join(dir, 'sessoes'), { recursive: true, force: true });
      sessao(dir, { aluno: 'ana', etapa: 0, atividades: [[id, tipo, 1, 'aprovado', celula, xp]] });
      return analisarAluno(raiz, 'ana', config);
    };
    assert.match(juntas(tenta('`../bia/entregas/etapa-00/relatorio.md`')), /sai da pasta do aluno/);
    assert.match(juntas(tenta('`academia/alunos/bia/entregas/etapa-00/relatorio.md`')), /evidência não encontrada/);
    assert.match(juntas(tenta('`academia/GAMIFICACAO.md`')), /evidência não encontrada/);
    assert.match(juntas(tenta('`entregas\\etapa-00\\x.md`')), /use "\/" no caminho/);
    assert.match(juntas(tenta('`entregas-vazia.md`')), /quase vazio/);
    assert.match(juntas(tenta('`entregas`')), /XP sem evidência/, 'sem caminho de arquivo, não vale');
    assert.match(juntas(tenta('feito e conferido ok')), /XP sem evidência/, 'nota solta não vale para quiz');
    assert.equal(tenta(evid(dir)).estado.xp, 10);
    // `r.ok` e `0.25` entre crases não são caminhos
    assert.equal(tenta(`${evid(dir)} com \`r.ok\` e \`0.25\``).estado.xp, 10);
  });

  it('exige a caixa exata do nome do arquivo (o GitHub diferencia; Windows e macOS não)', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    evid(dir, 'entregas/etapa-00/Relatorio.md');
    sessao(dir, { aluno: 'ana', etapa: 0, atividades: [['E00-quiz', 'quiz', 1, 'aprovado', '`entregas/etapa-00/relatorio.md`', 10]] });
    const { config } = carregarConfig(raiz);
    assert.match(juntas(analisarAluno(raiz, 'ana', config)), /evidência não encontrada/);
  });

  it('notas triviais não servem de evidência para competência nem checkpoint', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', etapa: 1, competencias: [['C01', 2, '..........'], ['C02', 2, 'ok'], ['C03', 2, 'TODO preencher'], ['C04', 2, 'sem evidência alguma']] });
    const { config } = carregarConfig(raiz);
    const r = analisarAluno(raiz, 'ana', config);
    assert.equal(r.erros.filter((e) => /sem evidência/.test(e.mensagem)).length, 4);
    assert.equal(r.estado.competencias.size, 0);
  });

  it('etapas sem lição pronta no ROADMAP não rendem XP', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', etapa: 2, atividades: [['E02-quiz', 'quiz', 1, 'aprovado', evid(dir), 10]] });
    const { config } = carregarConfig(raiz);
    const r = analisarAluno(raiz, 'ana', config);
    assert.match(juntas(r), /etapa 2 ainda não tem lição pronta/);
    assert.equal(r.estado.xp, 0);
  });

  it('E00-lab só vale com o perfil preenchido (CA4 da Missão 0)', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    fs.writeFileSync(path.join(dir, 'perfil.md'), '---\nslug: ana\nnome: Ana\ncompartilhar_xp: nao\nritmo: \n---\n\n## Objetivo com o curso\n\n## Ponto de partida\n\ncurto\n');
    sessao(dir, { aluno: 'ana', etapa: 0, atividades: [['E00-lab', 'laboratorio', 1, 'aprovado', evid(dir), 30]] });
    const { config } = carregarConfig(raiz);
    const r = analisarAluno(raiz, 'ana', config);
    assert.match(juntas(r), /E00-lab: perfil\.md incompleto.*ritmo.*Objetivo com o curso.*Ponto de partida.*Preferências de estudo.*Ambiente/);
    assert.equal(r.estado.xp, 0);
  });

  it('um XP esquecido pode ser concedido numa sessão seguinte', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    const ev = evid(dir);
    sessao(dir, { aluno: 'ana', numero: 1, etapa: 0, atividades: [['E00-quiz', 'quiz', 1, 'aprovado', ev, 0]] });
    sessao(dir, { aluno: 'ana', numero: 2, data: '2026-10-19', etapa: 0, atividades: [['E00-quiz', 'quiz', 2, 'aprovado', ev, 10]] });
    const { config } = carregarConfig(raiz);
    const r = analisarAluno(raiz, 'ana', config);
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.xp, 10);
  });
});

describe('revisão espaçada', () => {
  function cenario() {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    const config = configProntas(raiz);
    sessao(dir, { aluno: 'ana', numero: 1, etapa: 1, status: 'concluida', atividades: etapaCompleta(dir, 1) });
    return { raiz, dir, config };
  }
  const revisao = (id, n = 1) => [id, 'revisao', n, 'aprovado', NOTA, 10];

  it('sugere a 1ª revisão depois de 1 sessão e a 2ª só depois de mais 3 (conta sessões, não dias)', () => {
    const { raiz, dir, config } = cenario();
    assert.deepEqual(analisarAluno(raiz, 'ana', config).estado.revisoesSugeridas, [], 'ainda na própria sessão');
    sessao(dir, { aluno: 'ana', numero: 2, data: '2027-03-01', etapa: 2, retomada: 'sim' });
    let est = analisarAluno(raiz, 'ana', config).estado;
    assert.deepEqual(est.revisoesSugeridas.map((r) => [r.etapa, r.numero]), [[1, 1]]);
    assert.equal(est.xp, 40, 'meses de pausa não tiram XP');
    assert.ok(est.conquistas.has('A19'), 'voltar de uma pausa rende conquista');
    sessao(dir, { aluno: 'ana', numero: 3, data: '2027-03-02', etapa: 2, atividades: [revisao('R01-1')] });
    est = analisarAluno(raiz, 'ana', config).estado;
    assert.deepEqual(est.revisoesSugeridas, []);
    assert.equal(est.xp, 50);
    for (const [n, d] of [[4, '2027-03-03'], [5, '2027-03-04']]) sessao(dir, { aluno: 'ana', numero: n, data: d, etapa: 2 });
    assert.deepEqual(analisarAluno(raiz, 'ana', config).estado.revisoesSugeridas.map((r) => r.numero), [2]);
  });

  it('rejeita revisão na sessão da conclusão, fora de ordem, antes do prazo, de etapa não concluída e além da 4ª', () => {
    const { raiz, dir, config } = cenario();
    fs.rmSync(path.join(dir, 'sessoes'), { recursive: true });
    sessao(dir, { aluno: 'ana', numero: 1, etapa: 1, status: 'concluida', atividades: [...etapaCompleta(dir, 1), revisao('R01-1')] });
    sessao(dir, { aluno: 'ana', numero: 2, data: '2026-10-19', etapa: 2, atividades: [revisao('R01-2'), revisao('R02-1'), revisao('R01-5')] });
    const r = analisarAluno(raiz, 'ana', config);
    const m = juntas(r);
    assert.match(m, /R01-1: revisão de uma etapa que não foi concluída em uma sessão anterior/);
    assert.match(m, /R01-2: a próxima revisão desta etapa é R01-1/);
    assert.match(m, /R02-1: revisão de uma etapa que não foi concluída/);
    assert.match(m, /R01-5: só existem 4 revisões por etapa/);
    assert.equal(r.estado.xp, 40, 'nenhuma revisão inválida soma XP');
    sessao(dir, { aluno: 'ana', numero: 3, data: '2026-10-20', etapa: 2, atividades: [revisao('R01-1'), revisao('R01-2')] });
    const depois = analisarAluno(raiz, 'ana', config);
    assert.match(juntas(depois), /R01-2: ainda não é devida \(faltam 1 sessão\(ões\)\)/);
    assert.equal(depois.estado.xp, 50, 'só a R01-1 vale');
  });

  it('uma revisão paga fora de ordem não deixa o cartão sugerir de novo a mesma revisão', () => {
    const { raiz, dir, config } = cenario();
    sessao(dir, { aluno: 'ana', numero: 2, data: '2026-10-19', etapa: 2, atividades: [revisao('R01-2')] });
    const est = analisarAluno(raiz, 'ana', config).estado;
    assert.equal(est.xp, 40);
    assert.deepEqual(est.revisoesSugeridas.map((r) => r.numero), [1]);
  });
});

describe('etapas, competências, checkpoints e níveis', () => {
  it('não deixa concluir uma etapa sem quiz e laboratório aprovados (com XP)', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    const config = configProntas(raiz);
    sessao(dir, { aluno: 'ana', etapa: 1, status: 'concluida', atividades: [['E01-quiz', 'quiz', 1, 'aprovado', evid(dir, 'entregas/etapa-01/quiz.md'), 10]] });
    const r = analisarAluno(raiz, 'ana', config);
    assert.match(juntas(r), /etapa 1 marcada como concluída sem E01-lab aprovado/);
    assert.equal(r.estado.concluidas.size, 0);
  });

  it('valida competências: id existente, nível inteiro de 0 a 3 (célula vazia não vira 0) e evidência', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', etapa: 1, competencias: [['C99', 2, NOTA], ['C01', 5, NOTA], ['C02', 2, '-'], ['C03', '', NOTA], ['C04', '1.5', NOTA]] });
    const { config } = carregarConfig(raiz);
    const m = juntas(analisarAluno(raiz, 'ana', config));
    assert.match(m, /competência inexistente: C99/);
    assert.match(m, /C01: nível deve ser um inteiro de 0 a 3/);
    assert.match(m, /C02: nível 2 sem evidência/);
    assert.match(m, /C03: nível deve ser um inteiro/);
    assert.match(m, /C04: nível deve ser um inteiro/);
  });

  it('nível exige XP E checkpoints; checkpoint exige etapa concluída, evidência e competências da fase no nível 2', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    const config = configProntas(raiz);
    let n = 0;
    const proxima = (extra) => sessao(dir, { aluno: 'ana', numero: ++n, data: `2026-11-${String(n).padStart(2, '0')}`, ...extra });
    proxima({ etapa: 0, status: 'concluida', atividades: etapaCompleta(dir, 0) });
    for (const e of [1, 2, 3]) proxima({ etapa: e, status: 'concluida', atividades: etapaCompleta(dir, e, { explicacao: true }) });
    let r = analisarAluno(raiz, 'ana', config);
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.xp, 40 + 3 * 55);
    assert.equal(r.estado.nivel.nome, 'Aprendiz', 'XP >= 150, mas falta o CP1');
    assert.deepEqual(r.estado.faltaParaProximo, { xp: 0, checkpoints: ['CP1'] });

    // CP1 sem competências, sem evidência
    proxima({ etapa: 3, checkpoints: [['CP1', 'aprovado', '-']] });
    let m = juntas(analisarAluno(raiz, 'ana', config));
    assert.match(m, /CP1: aprovado sem evidência/);
    assert.match(m, /CP1: exige todas as competências da fase 1 no nível 2/);
    assert.equal(analisarAluno(raiz, 'ana', config).estado.checkpoints.size, 0);

    fs.rmSync(path.join(dir, 'sessoes', `2026-11-0${n}-s0${n}.md`));
    n -= 1;
    proxima({ etapa: 3, competencias: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07'].map((c) => [c, 2, NOTA]), checkpoints: [['CP1', 'aprovado', 'conversa de checkpoint registrada']] });
    r = analisarAluno(raiz, 'ana', config);
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.nivel.nome, 'Construtor');
    for (const a of ['A02', 'A03', 'A04', 'A05']) assert.ok(r.estado.conquistas.has(a), a);

    // CP2 antes de concluir a etapa 8
    proxima({ etapa: 8, checkpoints: [['CP2', 'aprovado', 'conversa de checkpoint registrada']] });
    m = juntas(analisarAluno(raiz, 'ana', config));
    assert.match(m, /CP2: exige a etapa 8 concluída/);
  });

  it('o piso de XP do nível vale mesmo com o checkpoint aprovado', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    const config = configProntas(raiz);
    for (const e of [1, 2, 3]) sessao(dir, { aluno: 'ana', numero: e, data: `2026-11-0${e}`, etapa: e, status: 'concluida', atividades: etapaCompleta(dir, e) });
    sessao(dir, { aluno: 'ana', numero: 4, data: '2026-11-04', etapa: 3, competencias: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07'].map((c) => [c, 2, NOTA]), checkpoints: [['CP1', 'aprovado', 'conversa de checkpoint registrada']] });
    const r = analisarAluno(raiz, 'ana', config);
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.xp, 120);
    assert.equal(r.estado.nivel.nome, 'Aprendiz', '120 XP < 150, mesmo com o CP1');
    assert.deepEqual(r.estado.faltaParaProximo, { xp: 30, checkpoints: [] });
  });

  it('a competência registrada é a da evidência mais recente (pode cair sem perder XP nem conquistas)', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', numero: 1, etapa: 1, competencias: [['C01', 2, NOTA], ['C02', 2, NOTA], ['C03', 2, NOTA]] });
    sessao(dir, { aluno: 'ana', numero: 2, data: '2026-10-19', etapa: 1, competencias: [['C01', 1, NOTA]] });
    const { config } = carregarConfig(raiz);
    const { estado } = analisarAluno(raiz, 'ana', config);
    assert.equal(estado.competencias.get('C01').nivel, 1);
    assert.ok(estado.conquistas.has('A02'), 'conquista não é revogada');
  });
});

describe('integridade dos arquivos de sessão', () => {
  const analisa = (montar) => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    montar(dir, raiz);
    const { config } = carregarConfig(raiz);
    return analisarAluno(raiz, 'ana', config);
  };

  it('detecta número repetido, buraco na numeração, data do nome diferente e data fora de ordem', () => {
    const r = analisa((dir) => {
      sessao(dir, { aluno: 'ana', numero: 1, data: '2026-10-20' });
      sessao(dir, { aluno: 'ana', numero: 1, data: '2026-10-21', nome: '2026-10-21-s01.md' });
      sessao(dir, { aluno: 'ana', numero: 3, data: '2026-10-19' });
      sessao(dir, { aluno: 'ana', numero: 4, data: '2026-10-25', nome: '2026-10-26-s04.md' });
    });
    const m = juntas(r);
    assert.match(m, /número de sessão repetido \(1\)/);
    assert.match(m, /data anterior à da sessão anterior/);
    assert.match(m, /a data do nome \(2026-10-26\) não confere/);
    const buraco = analisa((dir) => {
      sessao(dir, { aluno: 'ana', numero: 1, data: '2026-10-20' });
      sessao(dir, { aluno: 'ana', numero: 2, data: '2026-10-21' });
      sessao(dir, { aluno: 'ana', numero: 4, data: '2026-10-22' });
    });
    assert.match(juntas(buraco), /numeração fora de sequência: esperado s03/);
  });

  it('não ignora em silêncio arquivos com nome errado (.MD, sem s, pasta) nem pasta de aluno sem perfil', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', numero: 1, nome: '2026-10-18-s01.MD' });
    fs.mkdirSync(path.join(dir, 'sessoes', 'x.md'));
    fs.writeFileSync(path.join(dir, 'sessoes', 'anotacoes.md'), 'x');
    fs.mkdirSync(path.join(raiz, 'academia', 'alunos', 'fantasma'));
    const { config } = carregarConfig(raiz);
    const m = juntas(analisarAluno(raiz, 'ana', config));
    assert.match(m, /2026-10-18-s01\.MD: nome inválido|nome inválido: use AAAA-MM-DD-sNN\.md/);
    assert.match(m, /em sessoes\/ só cabem arquivos/);
    const { erros } = validarTudo(raiz);
    assert.ok(erros.some((e) => /pasta de aluno sem perfil\.md/.test(e.mensagem)));
  });

  it('aceita BOM e CRLF (Bloco de Notas e Git no Windows)', () => {
    const r = analisa((dir) => {
      const ev = evid(dir);
      sessao(dir, { aluno: 'ana', etapa: 0, crlf: true, bom: true, atividades: [['E00-quiz', 'quiz', 1, 'aprovado', ev, 10]] });
    });
    assert.deepEqual(r.erros, []);
    assert.equal(r.estado.xp, 10);
  });

  it('não perde linhas em silêncio: tabela sem separador, linhas depois de linha em branco e seção duplicada', () => {
    const r = analisa((dir) => {
      const nome = sessao(dir, { aluno: 'ana', etapa: 0 });
      const arq = path.join(dir, 'sessoes', nome);
      const ev = evid(dir);
      let t = fs.readFileSync(arq, 'utf8');
      t = t.replace('|---|---|---|---|---|---|\n', `|---|---|---|---|---|---|\n| E00-quiz | quiz | 1 | aprovado | ${ev} | 10 |\n\n| E00-lab | laboratorio | 1 | aprovado | ${ev} | 30 |\n`);
      t = t.replace('## Competências\n\n| id | nível | evidência |\n|---|---|---|', '## Competências\n\n| id | nível | evidência |\n| C01 | 1 | nota objetiva |');
      t += '\n## Resumo\n\nsegundo resumo\n';
      fs.writeFileSync(arq, t);
    });
    const m = juntas(r);
    assert.match(m, /há linhas de tabela depois de uma linha em branco/);
    assert.match(m, /tabela "Competências": falta a linha separadora/);
    assert.match(m, /seção duplicada: "## Resumo"/);
  });

  it('retomada: sim exige sessão anterior e 14 dias de pausa', () => {
    const r = analisa((dir) => {
      sessao(dir, { aluno: 'ana', numero: 1, data: '2026-10-01', retomada: 'sim' });
      sessao(dir, { aluno: 'ana', numero: 2, data: '2026-10-10', retomada: 'sim' });
      sessao(dir, { aluno: 'ana', numero: 3, data: '2026-10-24', retomada: 'sim' });
    });
    const erros = r.erros.filter((e) => /retomada: sim exige/.test(e.mensagem));
    assert.equal(erros.length, 2, 'a 1ª (sem anterior) e a 2ª (9 dias) são inválidas; a 3ª (14 dias) vale');
    assert.equal(r.estado.contagens.retomadas, 1);
    assert.ok(r.estado.conquistas.has('A19'));
  });

  it('um front matter sem aluno, com etapa fora de 0 a 16 ou campos vazios não derruba a validação', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    fs.writeFileSync(path.join(dir, 'sessoes', '2026-10-18-s01.md'), '---\naluno: ana\ndata: 2026-10-18\nsessao: 1\netapa: 99\nstatus_etapa: concluida\nretomada: nao\n---\n\n## Atividades\n\n| id | tipo | tentativa | resultado | evidência | XP |\n|---|---|---|---|---|---|\n');
    fs.writeFileSync(path.join(dir, 'sessoes', '2026-10-19-s02.md'), '---\n---\n');
    const copia = copiarRepo();
    fs.cpSync(dir, path.join(copia, 'academia', 'alunos', 'ana'), { recursive: true });
    let resultado;
    assert.doesNotThrow(() => { resultado = validarTudo(copia); });
    assert.match(resultado.erros.map((e) => e.mensagem).join('\n'), /`etapa` deve ser um inteiro de 0 a 16/);
  });
});

describe('alunos independentes', () => {
  it('o progresso de um aluno não altera o do outro', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', etapa: 0, status: 'concluida', atividades: etapaCompleta(dir, 0) });
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
    sessao(aluno(raiz, 'ana'), { aluno: 'bia' });
    fs.writeFileSync(path.join(raiz, 'academia', 'alunos', 'ana', 'perfil.md'), '---\nslug: outra\nnome: X\ncompartilhar_xp: talvez\n---\n');
    const { config } = carregarConfig(raiz);
    const m = juntas(analisarAluno(raiz, 'ana', config));
    assert.match(m, /aluno "bia" não confere com a pasta "ana"/);
    assert.match(m, /slug "outra" não confere/);
    assert.match(m, /compartilhar_xp/);
  });

  it('o PROGRESS.md só mostra o XP de quem compartilha, em ordem alfabética, sem datas nem ranking', () => {
    const raiz = montarRaiz();
    const zeca = aluno(raiz, 'zeca', { compartilhar: 'sim' });
    sessao(zeca, { aluno: 'zeca', etapa: 0, atividades: etapaCompleta(zeca, 0) });
    const ana = aluno(raiz, 'ana');
    sessao(ana, { aluno: 'ana', etapa: 0, atividades: etapaCompleta(ana, 0) });
    const { config } = carregarConfig(raiz);
    const estados = ['ana', 'zeca'].map((a) => analisarAluno(raiz, a, config).estado);
    const md = renderProgresso(estados, config);
    assert.ok(md.indexOf('| [ana]') < md.indexOf('| [zeca]'));
    assert.match(md, /\| \[ana\]\([^)]*\) \| Aprendiz \|[^|]*\|[^|]*\| — \|/);
    assert.match(md, /\| \[zeca\]\([^)]*\) \| Aprendiz \|[^|]*\|[^|]*\| 40 \|/);
    assert.ok(!/2026-/.test(md), 'sem datas de sessão');
  });

  it('validar --aluno e progresso <aluno> ignoram o estado quebrado do outro aluno', () => {
    const raiz = copiarRepo();
    const bia = aluno(raiz, 'bia');
    sessao(bia, { aluno: 'bia', etapa: 0, atividades: [['E00-quiz', 'quiz', 1, 'aprovado', '-', 500]] });
    const { config } = carregarConfig(raiz);
    gerarRegistros(raiz, config, { aluno: 'werther' });
    assert.ok(validarTudo(raiz).erros.some((e) => e.arquivo.includes('alunos/bia')), 'a validação global vê o erro da bia');
    assert.deepEqual(validarTudo(raiz, { aluno: 'werther' }).erros, []);
    const r = gerarRegistros(raiz, config, { aluno: 'werther' });
    assert.deepEqual(r.erros, []);
    const recusa = gerarRegistros(raiz, config, { aluno: 'bia' });
    assert.ok(recusa.erros.length > 0, 'progresso da própria bia recusa gravar');
    assert.ok(!fs.existsSync(path.join(raiz, 'academia', 'alunos', 'bia', 'retomada.md')));
  });
});

describe('arquivos gerados e comandos', () => {
  it('gerarRegistros cria retomada.md e PROGRESS.md e a checagem detecta desatualização', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', etapa: 0, status: 'concluida', atividades: etapaCompleta(dir, 0) });
    const { config } = carregarConfig(raiz);
    assert.ok(gerarRegistros(raiz, config, { somenteChecar: true }).erros.length >= 2, 'ainda não gerados');
    gerarRegistros(raiz, config);
    assert.deepEqual(gerarRegistros(raiz, config, { somenteChecar: true }).erros, []);
    const retomada = fs.readFileSync(path.join(raiz, 'academia', 'alunos', 'ana', 'retomada.md'), 'utf8');
    assert.match(retomada, /\*\*Nível:\*\* Aprendiz · \*\*XP:\*\* 40/);
    assert.match(retomada, /\*\*Próxima sessão:\*\* s02/);
    assert.match(retomada, /- \[x\] \*\*Bússola\*\*/);
    fs.appendFileSync(path.join(raiz, 'academia', 'alunos', 'ana', 'retomada.md'), '\nedição manual\n');
    assert.match(gerarRegistros(raiz, config, { somenteChecar: true }).erros[0].mensagem, /desatualizado/);
  });

  it('progresso recusa gravar quando as sessões têm erro (não grava XP inventado) e a checagem sozinha não basta', () => {
    const raiz = montarRaiz();
    sessao(aluno(raiz, 'ana'), { aluno: 'ana', etapa: 0, atividades: [['E00-quiz', 'quiz', 1, 'aprovado', '-', 500]] });
    const { config } = carregarConfig(raiz);
    const r = gerarRegistros(raiz, config);
    assert.ok(r.erros.length > 0);
    assert.ok(!fs.existsSync(path.join(raiz, 'academia', 'alunos', 'ana', 'retomada.md')));
    assert.ok(!fs.existsSync(path.join(raiz, 'academia', 'PROGRESS.md')));
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

  it('sessao cria o próximo arquivo numerado sem sobrescrever; novo-aluno cria perfil e pastas', () => {
    const raiz = montarRaiz();
    const { config } = carregarConfig(raiz);
    assert.equal(criarAluno(raiz, config, 'caio', 'Caio'), 'academia/alunos/caio');
    for (const sub of ['sessoes', 'entregas']) assert.ok(fs.existsSync(path.join(raiz, 'academia', 'alunos', 'caio', sub, '.gitkeep')));
    assert.throws(() => criarAluno(raiz, config, 'caio', 'Caio'), /já existe/);
    assert.throws(() => criarAluno(raiz, config, 'Nome Ruim', 'X'), /slug inválido/);
    assert.throws(() => criarAluno(raiz, config, 'con', 'X'), /slug inválido/);
    assert.equal(criarSessao(raiz, config, 'caio', { data: '2026-10-20' }), 'academia/alunos/caio/sessoes/2026-10-20-s01.md');
    assert.deepEqual(analisarAluno(raiz, 'caio', config).erros, [], 'a sessão recém-criada já é válida');
    assert.equal(criarSessao(raiz, config, 'caio', { data: '2026-10-20' }), 'academia/alunos/caio/sessoes/2026-10-20-s02.md');
    assert.throws(() => criarSessao(raiz, config, 'ninguem'), /não encontrado/);
    assert.throws(() => criarSessao(raiz, config, 'caio', { data: '2026-02-31' }), /data real/);
  });

  it('main devolve códigos de saída coerentes e rejeita opções erradas', () => {
    const raiz = montarRaiz();
    const mudo = { log: console.log, error: console.error };
    console.log = () => {}; console.error = () => {};
    try {
      assert.equal(main(['ajuda'], raiz), 0);
      assert.equal(main(['inexistente'], raiz), 2);
      assert.equal(main(['novo-aluno', 'dani', 'Dani'], raiz), 0);
      assert.equal(main(['novo-aluno'], raiz), 1);
      assert.equal(main(['progresso', '--check'], raiz), 0);
      assert.equal(main(['progresso', '--chek'], raiz), 1, 'opção com erro de digitação não pode virar escrita');
      assert.equal(main(['progresso', 'dani'], raiz), 0);
      assert.equal(main(['sessao', 'dani', '--etapa', '99'], raiz), 1);
      assert.equal(main(['sessao', 'dani', '--data', 'ontem'], raiz), 1);
      assert.equal(main(['sessao', 'dani', '--data'], raiz), 1, '--data sem valor');
      assert.equal(main(['sessao', 'dani', '--etapa', '1', '--data', '2026-10-20'], raiz), 0);
      assert.equal(main(['kit'], raiz), 1);
    } finally { console.log = mudo.log; console.error = mudo.error; }
  });

  it('validar e progresso funcionam de ponta a ponta no repositório copiado e o programa roda por symlink/junction', () => {
    const copia = copiarRepo();
    const script = path.join(copia, 'academia', 'ferramentas', 'academia.mjs');
    const ok = spawnSync(process.execPath, [script, 'validar'], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /Tudo certo/);

    const alvo = novoTmp('academia-link-');
    const link = path.join(alvo, 'atalho');
    fs.symlinkSync(copia, link, 'junction');
    const viaLink = spawnSync(process.execPath, [path.join(link, 'academia', 'ferramentas', 'academia.mjs'), 'validar'], { encoding: 'utf8' });
    assert.equal(viaLink.status, 0, viaLink.stdout + viaLink.stderr);
    assert.match(viaLink.stdout, /Tudo certo/, 'por symlink o programa precisa imprimir e não sair calado');

    // quebra um registro: o exit code tem que refletir
    const ana = aluno(copia, 'ana');
    sessao(ana, { aluno: 'ana', etapa: 0, atividades: [['E00-quiz', 'quiz', 1, 'aprovado', '-', 500]] });
    const falha = spawnSync(process.execPath, [script, 'validar', '--aluno', 'ana'], { encoding: 'utf8' });
    assert.equal(falha.status, 1);
    assert.match(falha.stdout, /E00-quiz: XP 500 não confere/);
    const semGravar = spawnSync(process.execPath, [script, 'progresso', 'ana'], { encoding: 'utf8' });
    assert.equal(semGravar.status, 1);
    assert.match(semGravar.stdout, /nada foi gravado/);
  });
});

describe('kit de colagem', () => {
  it('traz instruções, dados da sessão, regras, retomada e lição sem gabarito', () => {
    const copia = copiarRepo();
    const { config } = carregarConfig(copia);
    const kit = montarKit(copia, config, 'werther', { hoje: '2026-10-18' });
    assert.match(kit, /sessao: 1\b/);
    assert.match(kit, /data: 2026-10-18/);
    assert.match(kit, /aluno: werther/);
    assert.match(kit, /arquivo: academia\/alunos\/werther\/sessoes\/2026-10-18-s01\.md/);
    for (const parte of ['AI_CONTEXT.md', 'academia/GAMIFICACAO.md', 'academia/competencias.md', 'academia/templates/relatorio-sessao.md', 'academia/alunos/werther/retomada.md']) {
      assert.ok(kit.includes(`===== ${parte} =====`), parte);
    }
    assert.match(kit, /LIÇÃO: Missão 0 \(sem o gabarito\)/);
    assert.ok(!kit.includes('Pare.** Só abra'), 'o gabarito não pode ir no kit');
    assert.throws(() => montarKit(copia, config, 'ninguem'), /não encontrado/);
  });

  it('na etapa sem lição pronta, o kit traz o plano do ROADMAP e o template; nas revisões, só as perguntas', () => {
    const copia = copiarRepo();
    const dir = path.join(copia, 'academia', 'alunos', 'werther');
    const preenchido = 'Texto do aluno com mais de vinte letras para valer como preenchido.';
    fs.writeFileSync(path.join(dir, 'perfil.md'), `---\nslug: werther\nnome: Werther\ncompartilhar_xp: nao\nritmo: 3 horas por semana\n---\n\n## Objetivo com o curso\n\n${preenchido}\n\n## Ponto de partida\n\n${preenchido}\n\n## Preferências de estudo\n\n${preenchido}\n\n## Ambiente\n\n${preenchido}\n`);
    const { config } = carregarConfig(copia);
    const ev = (rel) => evid(dir, rel);
    sessao(dir, { aluno: 'werther', numero: 1, etapa: 0, status: 'concluida', atividades: [['E00-quiz', 'quiz', 1, 'aprovado', ev('entregas/etapa-00/diagnostico.md'), 10], ['E00-lab', 'laboratorio', 1, 'aprovado', ev('entregas/etapa-00/ambiente.md'), 30]] });
    sessao(dir, { aluno: 'werther', numero: 2, data: '2026-10-19', etapa: 1, status: 'concluida', atividades: [['E01-quiz', 'quiz', 1, 'aprovado', ev('entregas/etapa-01/quiz.md'), 10], ['E01-lab', 'laboratorio', 1, 'aprovado', ev('entregas/etapa-01/relatorio.md'), 30]] });
    sessao(dir, { aluno: 'werther', numero: 3, data: '2026-10-20', etapa: 2 });
    const kit = montarKit(copia, config, 'werther', { hoje: '2026-10-21' });
    assert.match(kit, /sessao: 4\b/);
    assert.match(kit, /ETAPA 2 AINDA SEM LIÇÃO/);
    assert.match(kit, /### Etapa 2 · APIs, TypeScript/);
    assert.match(kit, /--- template ---/);
    assert.match(kit, /REVISÃO SUGERIDA: etapa 1, revisão 1 \(id R01-1\)/);
    assert.match(kit, /## 7\. Quiz de fixação/);
    assert.ok(!kit.includes('Corrigir com a resposta já escrita'), 'sem o gabarito da lição 1');
  });
});

describe('validação de links, segredos e utilitários de Markdown', () => {
  it('detecta arquivo e âncora inexistentes e ignora links externos e blocos de código', () => {
    const raiz = montarRaiz();
    fs.writeFileSync(path.join(raiz, 'academia', 'a.md'), [
      '# Título A', '', '## Seção Dois', '',
      '[ok](b.md) [ok2](b.md#parte-um) [ok3](#seção-dois) [externo](https://example.com/x) [mail](mailto:a@b.c)',
      '[quebrado](nao-existe.md) [âncora ruim](b.md#nao-existe) [caixa errada](B.MD)',
      '```', '[dentro de código](nada.md)', '```', '`[inline](nada2.md)`',
    ].join('\n'));
    fs.writeFileSync(path.join(raiz, 'academia', 'b.md'), '# B\n\n## Parte um\n');
    // a cópia dos documentos reais no repositório de mentira tem links quebrados; só interessam os de a.md
    const msgs = validarLinks(raiz).filter((e) => e.arquivo.startsWith('academia/a.md')).map((e) => e.mensagem);
    assert.deepEqual(msgs, ['link quebrado: nao-existe.md', 'âncora inexistente: b.md#nao-existe', 'link quebrado: B.MD']);
  });

  it('validarSegredos varre qualquer arquivo de texto, aponta o arquivo e a linha e nunca imprime o segredo', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    const segredo = 'sk-' + 'Zq9x'.repeat(8);
    fs.mkdirSync(path.join(dir, 'entregas'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'entregas', 'cliente.ts'), `const a = 1;\nconst k = "${segredo}";\n`);
    fs.writeFileSync(path.join(dir, 'entregas', '.env.local'), 'TOKEN=abc\nURL=https://' + 'usuario' + ':' + 'senha123' + '@host.exemplo/v1\n');
    fs.writeFileSync(path.join(dir, 'entregas', 'saida.log'), 'authorization: bearer ' + 'abcdefghij1234567890\n');
    fs.writeFileSync(path.join(dir, 'entregas', 'ok.md'), 'risk-assessment-framework e task-queue-implementation-notes e disk-usage-by-directory\napiKey: process.env.OPENAI_API_KEY\n');
    const erros = validarSegredos(raiz);
    const arquivos = erros.map((e) => e.arquivo).sort();
    assert.deepEqual(arquivos, [
      'academia/alunos/ana/entregas/.env.local:2', 'academia/alunos/ana/entregas/cliente.ts:2', 'academia/alunos/ana/entregas/saida.log:1',
    ]);
    assert.ok(!JSON.stringify(erros).includes(segredo));
    assert.ok(!JSON.stringify(erros).includes('senha123'));
  });

  it('acharSegredos: padrões com fronteira de palavra, Bearer em qualquer caixa e query strings', () => {
    const casos = [
      ['a chave sk-' + 'A1b2'.repeat(6), true],
      ['risk-assessment-framework-template', false],
      ['Authorization: Bearer ' + 'x'.repeat(20), true],
      ['authorization: bearer ' + 'x'.repeat(20), true],
      ['Bearer ${apiKey}', false],
      ['https://api.exemplo/v1?key=' + 'abcd1234efgh', true],
      ['https://api.exemplo/v1?page=2', false],
      ['api_key: "' + 'z'.repeat(20) + '"', true],
      ['apiKey: process.env.OPENAI_API_KEY', false],
      ['ghp_' + 'A'.repeat(25), true],
      ['AIza' + 'B'.repeat(35), true],
      ['hf_' + 'c'.repeat(32), true],
    ];
    for (const [texto, esperado] of casos) assert.equal(acharSegredos(texto).length > 0, esperado, texto);
  });

  it('limparSaida e enderecoSeguro mascaram credenciais', () => {
    assert.equal(enderecoSeguro('http://u:p@h.exemplo:8080/v1/x?k=1#f'), 'http://h.exemplo:8080/v1/x');
    assert.equal(enderecoSeguro('isto não é url'), null);
    assert.ok(!limparSaida('http://user:pa@ss@host/v1').includes('ss@'));
    assert.ok(!limparSaida('GET /v1?token=SEGREDOSEGREDO').includes('SEGREDOSEGREDO'));
    assert.ok(!limparSaida('falhou com sk-proj-ABCD********wxyz no corpo').includes('ABCD'));
    assert.ok(!limparSaida('chave minhachavesecreta aqui', { chave: 'minhachavesecreta' }).includes('minhachave'));
    assert.ok(!limparSaida('Bearer abc.def.ghi').includes('abc.def'));
    assert.equal(limparSaida('qwen3.5:4b respondeu ok'), 'qwen3.5:4b respondeu ok');
  });

  it('tabela, frontMatter, secoes, inteiro e slug', () => {
    assert.deepEqual([...tabela(['texto', '| Nível | XP mínimo |', '|---|---|', '| `a\\|b` | 3 |'])], [{ nivel: '`a|b`', xp_minimo: '3' }]);
    assert.equal(tabela(['sem tabela']), null);
    assert.deepEqual(tabela(['| a |', '|---|', '| 1 |']).problemas, []);
    assert.match(tabela(['| a |', '| 1 |']).problemas[0], /separadora/);
    assert.deepEqual(frontMatter('---\na: 1\nb: "dois"\n---\ncorpo').dados, { a: '1', b: 'dois' });
    assert.equal(frontMatter('---\n---\ncorpo\n---\nmais').tem, true);
    assert.equal(frontMatter('sem front matter').tem, false);
    assert.deepEqual(secoes('## A\nx\n## A\ny').duplicadas, ['A']);
    assert.ok(Number.isNaN(inteiro('')) && Number.isNaN(inteiro('1.5')) && inteiro(' 7 ') === 7);
    assert.equal(slug('6. Exemplos práticos'), '6-exemplos-práticos');
    assert.equal(slug('Etapa 2 · APIs, TypeScript'), 'etapa-2--apis-typescript');
    assert.equal(slug('`XP` e [níveis](x.md)'), 'xp-e-níveis');
  });

  it('renderRetomada lista pendências, último feedback, próxima sessão e não quebra links relativos copiados', () => {
    const raiz = montarRaiz();
    const dir = aluno(raiz, 'ana');
    sessao(dir, { aluno: 'ana', etapa: 1, atividades: [['E01-lab', 'laboratorio', 1, 'reprovado', NOTA, 0]], pendencias: ['refazer o CA3 ([guia](../../../licoes/x/README.md))'], proxima: 'Corrigir a inclinação.' });
    const { config } = carregarConfig(raiz);
    const est = analisarAluno(raiz, 'ana', config).estado;
    const md = renderRetomada(est, config);
    assert.match(md, /- refazer o CA3 \(guia\)/);
    assert.match(md, /Atividade `E01-lab` sem aprovação \(1 tentativa, última: reprovado\)/);
    assert.match(md, /Corrigir a inclinação\./);
    assert.match(md, /## Último feedback\n\n> Bom trabalho\./);
    assert.match(md, /\*\*Próxima sessão:\*\* s02/);
    assert.equal(renderRetomada(est, config), md, 'determinística');
  });
});
