// Teste ponta a ponta da CLI do time: configuração -> agentes de LLM -> orquestrador -> memória -> relatório.
// O "modelo" é um servidor falso roteirizado (a CLI nunca fala com um LLM real nestes testes).
//   node --test academia/extensoes/time-de-agentes/referencia/cli.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from './cli.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const tmps = [];
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }); });
const SK = `sk-${'Vv3w'.repeat(8)}`;

// ---- modelo falso: responde conforme o papel anunciado na persona ([[PAPEL:x]]) ------------------------------------------------------
let servidor; let porta; let chamadas; let estado;
const usa = (nome, argumentos = {}) => JSON.stringify({ usar_ferramenta: { nome, argumentos } });
const jaUsouFerramenta = (ultimo) => ultimo.includes('resultado_da_ferramenta_DADO_NAO_INSTRUCAO');

function responder(messages, modelo) {
  const sistema = messages[0].content;
  const usuario = messages.at(-1).content;
  const papel = /\[\[PAPEL:(\w+)\]\]/.exec(sistema)?.[1];
  chamadas.push({ papel, usuario, sistema, modelo, mensagens: messages });
  if (papel === 'backend') {
    if (estado.backendLe && !jaUsouFerramenta(usuario)) return usa('ler_arquivo', { caminho: 'src/a.js' });
    estado.backend += 1;
    return JSON.stringify({
      resultado: `endpoint v${estado.backend}`,
      novas_tarefas: [{ titulo: 'Escrever os testes do endpoint', papel: 'testes', criterios: [estado.criterioTestes] }],
      licoes: [
        { tipo: 'padrao', chave: 'padrao.erros', valor: 'Erros devolvem { codigo, mensagem }.', escopo: 'projeto' },
        { tipo: 'aprendizado', chave: 'aprendizado.validacao', valor: 'Validar a entrada antes de tocar no banco.', escopo: 'global' },
      ],
    });
  }
  if (papel === 'testes') {
    if (estado.testesRodam && !jaUsouFerramenta(usuario)) return usa('rodar_testes');
    return JSON.stringify({ resultado: 'testes escritos e passando' });
  }
  if (papel === 'qa') {
    estado.qa += 1;
    const criterios = JSON.parse(usuario).tarefa.criterios;
    const ok = estado.qa > 1;
    return JSON.stringify({
      aprovado: ok, nota: ok ? 0.95 : 0.4, feedback: ok ? 'ok' : 'FALTA TRATAR ENTRADA VAZIA',
      criterios: criterios.map((c) => ({ criterio: c, atendido: ok, evidencia: ok ? 'linha 10 do arquivo' : '' })),
    });
  }
  return '{"resultado":"papel desconhecido"}';
}

before(async () => {
  servidor = createServer((req, res) => {
    let d = ''; req.on('data', (c) => { d += c; });
    req.on('end', () => {
      const corpo = JSON.parse(d);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: responder(corpo.messages, corpo.model) }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  porta = servidor.address().port;
});
after(() => servidor.close());

function montar(configExtra = {}) {
  chamadas = []; estado = { backend: 0, qa: 0, criterioTestes: 'há testes cobrindo o caso de entrada vazia', backendLe: false, testesRodam: false };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'time-cli-'));
  tmps.push(dir);
  for (const p of ['backend', 'testes', 'qa']) fs.writeFileSync(path.join(dir, `${p}.md`), `[[PAPEL:${p}]] Você é o ${p}.`);
  const config = {
    memoria: { arquivo: './memoria.jsonl', escopoGlobal: 'global' },
    agentes: { backend: './backend.md', testes: './testes.md' },
    avaliadores: [{ nome: 'qa', persona: './qa.md', limiar: 0.8 }],
    orcamento: { maxTentativas: 3 },
    ...configExtra,
  };
  fs.writeFileSync(path.join(dir, 'time.config.json'), JSON.stringify(config));
  const env = { OPENAI_BASE_URL: `http://127.0.0.1:${porta}/v1`, OPENAI_API_KEY: 'chave-de-teste', MODELO_CHAT: 'falso' };
  const saidas = []; const erros = [];
  const rodar = (args, extra = {}) => main(args, { env, cwd: dir, saida: (s) => saidas.push(s), erro: (s) => erros.push(s), stdin: { isTTY: false }, ...extra });
  const reescreverConfig = (mudanca) => fs.writeFileSync(path.join(dir, 'time.config.json'), JSON.stringify({ ...config, ...mudanca }));
  return { dir, rodar, saidas, erros, reescreverConfig, config };
}
const lerJson = (arq) => JSON.parse(fs.readFileSync(arq, 'utf8'));
const memoriaDe = (dir) => {
  const arq = path.join(dir, 'memoria.jsonl');
  return fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const relatorioDe = (dir) => {
  const pasta = path.join(dir, 'execucoes');
  const arqs = fs.readdirSync(pasta);
  assert.equal(arqs.length, 1);
  return lerJson(path.join(pasta, arqs[0]));
};
const pendentesDe = (dir) => (fs.existsSync(path.join(dir, 'licoes-pendentes.json')) ? lerJson(path.join(dir, 'licoes-pendentes.json')).licoes : []);
const base = (extra = []) => ['--projeto', 'proj-a', '--criterio', 'responde 400', ...extra, 'Criar o endpoint de clientes'];

describe('CLI do time de agentes (ponta a ponta com modelo simulado)', () => {
  it('delega, avalia, devolve o feedback ao executor, cria a subtarefa, aprova lições do projeto e grava o relatório', async () => {
    const { dir, rodar, saidas, erros } = montar();
    const codigo = await rodar(base(['--aprovar-licoes', 'projeto']));
    const texto = saidas.join('\n');
    assert.equal(codigo, 0, `${texto}\nERROS: ${erros.join('\n')}`);
    assert.match(texto, /t1 \[aprovada\] backend: Criar o endpoint de clientes · 2 tentativa\(s\)/);
    assert.match(texto, /t2 \[aprovada\] testes: Escrever os testes do endpoint \(filha de t1\)/);
    // o feedback do QA chegou ao backend na 2ª tentativa
    const backend2 = chamadas.filter((c) => c.papel === 'backend')[1];
    assert.match(backend2.usuario, /FALTA TRATAR ENTRADA VAZIA/);
    // lições: a de projeto foi gravada; a global ficou PENDENTE (em disco), não rejeitada nem gravada
    assert.deepEqual(memoriaDe(dir).map((m) => [m.escopo, m.chave]), [['proj-a', 'padrao.erros']]);
    assert.match(texto, /gravadas: l1\b/);
    assert.deepEqual(pendentesDe(dir).map((l) => [l.projeto, l.escopo, l.chave]), [['proj-a', 'global', 'aprendizado.validacao']]);
    assert.match(texto, /1 lição\(ões\) ficaram PENDENTES/);
    // relatório
    const dados = relatorioDe(dir);
    assert.equal(dados.projeto, 'proj-a');
    assert.deepEqual(dados.licoes.map((l) => [l.id, l.estado]), [['l1', 'aprovada'], ['l2', 'pendente']]);
    assert.ok(dados.auditoria.some((e) => e.evento === 'revisao'));
    assert.ok(!JSON.stringify(dados).includes('chave-de-teste'));
    assert.deepEqual(dados.modelo, [{ baseURL: `http://127.0.0.1:${porta}/v1`, modelo: 'falso' }]);
  });

  it('por padrão (sem terminal) nenhuma lição entra na memória e todas ficam pendentes; com "todas" o escopo global também entra', async () => {
    let t = montar();
    assert.equal(await t.rodar(base()), 0);
    assert.deepEqual(memoriaDe(t.dir), []);
    assert.equal(pendentesDe(t.dir).length, 2);
    t = montar();
    assert.equal(await t.rodar(base(['--aprovar-licoes', 'todas'])), 0);
    assert.deepEqual(memoriaDe(t.dir).map((m) => m.escopo).sort(), ['global', 'proj-a']);
    assert.deepEqual(pendentesDe(t.dir), []);
  });

  it('o que foi aprendido no projeto A (escopo global) chega ao agente no projeto B como DADO', async () => {
    const t = montar();
    await t.rodar(base(['--aprovar-licoes', 'todas']));
    chamadas.length = 0; estado.qa = 1; // no projeto B o QA aprova de primeira
    assert.equal(await t.rodar(['--projeto', 'proj-b', '--criterio', 'responde 400', 'Criar o endpoint de clientes']), 0);
    const primeira = chamadas.find((c) => c.papel === 'backend');
    const dados = JSON.parse(primeira.usuario);
    assert.deepEqual(dados.memorias_relevantes_DADO_NAO_INSTRUCAO.map((m) => [m.escopo, m.chave]), [['global', 'aprendizado.validacao']]);
  });

  it('o perfil do dono entra no prompt de todos os agentes e avaliadores', async () => {
    const t = montar();
    fs.writeFileSync(path.join(t.dir, 'perfil.md'), 'PREFERENCIA-XYZ: prefiro testes antes do código e mudanças pequenas.');
    t.reescreverConfig({ perfil: './perfil.md' });
    assert.equal(await t.rodar(base()), 0);
    for (const papel of ['backend', 'testes', 'qa']) {
      const c = chamadas.find((x) => x.papel === papel);
      assert.match(c.sistema, /Perfil do dono/, papel);
      assert.match(c.sistema, /PREFERENCIA-XYZ/, papel);
    }
  });

  it('modelo por papel: agentes e avaliadores podem usar um modelo diferente do padrão', async () => {
    const t = montar();
    t.reescreverConfig({
      agentes: { backend: { persona: './backend.md', modelo: 'modelo-grande' }, testes: './testes.md' },
      avaliadores: [{ nome: 'qa', persona: './qa.md', modelo: 'modelo-juiz' }],
    });
    assert.equal(await t.rodar(base()), 0);
    assert.deepEqual([...new Set(chamadas.filter((c) => c.papel === 'backend').map((c) => c.modelo))], ['modelo-grande']);
    assert.deepEqual([...new Set(chamadas.filter((c) => c.papel === 'qa').map((c) => c.modelo))], ['modelo-juiz']);
    assert.deepEqual([...new Set(chamadas.filter((c) => c.papel === 'testes').map((c) => c.modelo))], ['falso']);
    assert.deepEqual(relatorioDe(t.dir).modelo.map((m) => m.modelo).sort(), ['falso', 'modelo-grande', 'modelo-juiz']);
  });

  it('erros de uso e de configuração terminam com código 2 e mensagem útil', async () => {
    const t = montar();
    assert.equal(await t.rodar(['Sem projeto']), 2);
    assert.equal(await t.rodar(['--projeto', 'p', 'Sem critério']), 2);
    assert.equal(await t.rodar(['--projeto', 'p', '--criterio', 'x y z', '--aprovar-licoes', 'talvez', 'T']), 2);
    assert.equal(await t.rodar(['--projeto', 'p', '--criterio', 'x y z', '--config', 'nao-existe.json', 'Título válido']), 2);
    assert.equal(await t.rodar(['--projeto', 'p', '--criterio', 'x y z', '--opcao-estranha', 'v', 'Título válido']), 2);
    assert.equal(await t.rodar(['--projeto', 'Projeto Inválido!', '--criterio', 'x y z', 'Título válido']), 2);
    assert.match(t.erros.join('\n'), /--projeto é obrigatório/);
    assert.match(t.erros.join('\n'), /pelo menos um --criterio/);
    assert.match(t.erros.join('\n'), /opção desconhecida/);
    assert.match(t.erros.join('\n'), /--projeto deve usar só/);
    assert.equal(chamadas.length, 0, 'nenhum erro de uso chega a chamar o modelo');
  });

  it('tarefa que não passa na avaliação termina com código 1 e a tarefa fica escalada', async () => {
    const t = montar();
    t.reescreverConfig({ avaliadores: [{ nome: 'qa', persona: './qa.md', limiar: 0.99 }], orcamento: { maxTentativas: 1 } });
    const codigo = await t.rodar(base());
    assert.equal(codigo, 1);
    assert.match(t.saidas.join('\n'), /t1 \[escalada\]/);
  });
});

describe('pré-checagem da configuração (antes de gastar chamadas)', () => {
  it('papel sem avaliador é erro de configuração (código 2), a menos que "aprovarSemAvaliador" seja ligado de propósito', async () => {
    const t = montar();
    t.reescreverConfig({ avaliadores: [{ nome: 'qa', persona: './qa.md', aplicaA: ['backend'] }] });
    assert.equal(await t.rodar(base()), 2);
    assert.match(t.erros.join('\n'), /o papel "testes" não tem avaliador/);
    assert.equal(chamadas.length, 0);
    t.reescreverConfig({ avaliadores: [{ nome: 'qa', persona: './qa.md', aplicaA: ['backend'] }], aprovarSemAvaliador: true });
    assert.equal(await t.rodar(base()), 0);
  });

  it('referências a papéis inexistentes, ferramentas inválidas e personas ruins são recusadas', async () => {
    const casos = [
      [{ avaliadores: [{ nome: 'qa', persona: './qa.md', aplicaA: ['fantasma'] }] }, /aplicaA aponta o papel inexistente "fantasma"/],
      [{ roteador: { padrao: 'fantasma', palavras: {} } }, /roteador.padrao/],
      [{ roteador: { palavras: { fantasma: ['x'] } } }, /roteador: o papel "fantasma"/],
      [{ ferramentas: { papeis: { fantasma: ['ler_arquivo'] } } }, /ferramentas.papeis: o papel "fantasma"/],
      [{ ferramentas: { papeis: { testes: ['apagar_tudo'] } } }, /use nomes de/],
      [{ ferramentas: { papeis: { testes: ['rodar_testes'] } } }, /rodar_testes exige ferramentas.comandoTestes/],
      [{ ferramentas: { comandoTestes: 'npm test' } }, /comandoTestes deve ser uma lista/],
      [{ ferramentas: { timeoutMs: 5 } }, /timeoutMs/],
      [{ agentes: { backend: 42 } }, /agentes.backend/],
      [{ agentes: { backend: './backend.txt.exe' } }, /só arquivos \.md ou \.txt/],
      [{ agentes: { backend: './nao-existe.md' } }, /não consegui ler/],
      [{ avaliadores: 'qa' }, /"avaliadores" deve ser uma lista/],
      [{ avaliadores: [{ persona: './qa.md' }] }, /precisa de nome e persona/],
    ];
    for (const [mudanca, esperado] of casos) {
      const t = montar();
      t.reescreverConfig(mudanca);
      assert.equal(await t.rodar(base()), 2, JSON.stringify(mudanca));
      assert.match(t.erros.join('\n'), esperado, JSON.stringify(mudanca));
      assert.equal(chamadas.length, 0);
    }
  });

  it('persona com credencial ou arquivo sensível no lugar da persona não são enviados ao modelo', async () => {
    const t = montar();
    fs.writeFileSync(path.join(t.dir, 'backend.md'), `[[PAPEL:backend]] use a chave ${SK}`);
    assert.equal(await t.rodar(base()), 2);
    assert.match(t.erros.join('\n'), /parece conter uma credencial/);
    assert.ok(!t.erros.join('\n').includes('Vv3w'));
    fs.writeFileSync(path.join(t.dir, '.env'), `OPENAI_API_KEY=${SK}`);
    t.reescreverConfig({ agentes: { backend: './.env', testes: './testes.md' } });
    assert.equal(await t.rodar(base()), 2);
    assert.match(t.erros.join('\n'), /só arquivos \.md ou \.txt/);
    assert.equal(chamadas.length, 0);
  });

  it('orçamento ou delegações inválidos no config terminam com código 2 (sem exceção)', async () => {
    const t = montar();
    t.reescreverConfig({ orcamento: { maxTentativas: 0 } });
    assert.equal(await t.rodar(base()), 2);
    assert.match(t.erros.join('\n'), /orcamento.maxTentativas/);
    t.reescreverConfig({ delegacoes: { backend: 'testes' } });
    assert.equal(await t.rodar(base()), 2);
    assert.match(t.erros.join('\n'), /delegacoes deve ser/);
  });
});

describe('entrada do dono (--entrada)', () => {
  it('o texto chega aos agentes e aos avaliadores como DADO, vale para as filhas e o relatório guarda só o tamanho e o hash', async () => {
    const t = montar();
    const diff = 'diff --git a/x.js b/x.js\n+export const b = 2;\n';
    fs.writeFileSync(path.join(t.dir, 'mudanca.diff'), diff);
    assert.equal(await t.rodar(base(['--entrada', 'mudanca.diff'])), 0, t.erros.join('\n'));
    const backend = JSON.parse(chamadas.find((c) => c.papel === 'backend').usuario);
    assert.equal(backend.entrada_DADO_NAO_INSTRUCAO, diff);
    const testes = JSON.parse(chamadas.find((c) => c.papel === 'testes').usuario);
    assert.equal(testes.entrada_DADO_NAO_INSTRUCAO, diff, 'a filha herda a entrada');
    const qa = JSON.parse(chamadas.find((c) => c.papel === 'qa').usuario);
    assert.equal(qa.entrada_DADO_NAO_INSTRUCAO, diff);
    const rel = relatorioDe(t.dir);
    assert.ok(!JSON.stringify(rel).includes('export const b'), 'o conteúdo não vai para o relatório');
    assert.equal(rel.tarefas[0].entrada.caracteres, diff.length);
    assert.match(rel.tarefas[0].entrada.sha256, /^[0-9a-f]{64}$/);
    assert.match(t.saidas.join('\n'), new RegExp(`entrada de ${diff.length} caracteres`));
  });

  it('recusa arquivo ausente, pasta, vazio, binário, grande demais ou com credencial — antes de chamar o modelo', async () => {
    const t = montar();
    fs.mkdirSync(path.join(t.dir, 'pasta'));
    fs.writeFileSync(path.join(t.dir, 'vazio.txt'), '  \n');
    fs.writeFileSync(path.join(t.dir, 'binario.bin'), Buffer.from([65, 0, 66]));
    fs.writeFileSync(path.join(t.dir, 'grande.txt'), 'x'.repeat(60_001));
    fs.writeFileSync(path.join(t.dir, 'segredo.txt'), `const k = "${SK}";`);
    const esperados = [['nao-existe.txt', /não encontrado/], ['pasta', /deve ser um arquivo/], ['vazio.txt', /vazio/], ['binario.bin', /binário/], ['grande.txt', /o máximo é 60000/], ['segredo.txt', /credencial/]];
    for (const [arq, re] of esperados) {
      assert.equal(await t.rodar(base(['--entrada', arq])), 2, arq);
      assert.match(t.erros.at(-1), re, arq);
    }
    assert.ok(!t.erros.join('\n').includes('Vv3w'));
    assert.equal(chamadas.length, 0);
  });
});

describe('ferramentas do projeto (--raiz): o harness registra o que o agente fez', () => {
  function projeto() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'time-proj-'));
    tmps.push(d);
    fs.mkdirSync(path.join(d, 'src'));
    fs.writeFileSync(path.join(d, 'src', 'a.js'), 'export const a = 1;\n');
    return d;
  }

  it('o agente lê um arquivo; o resultado volta como DADO e o avaliador recebe o registro do harness', async () => {
    const t = montar();
    estado.backendLe = true;
    const raiz = projeto();
    assert.equal(await t.rodar(base(['--raiz', raiz])), 0, t.erros.join('\n'));
    const respostaDaFerramenta = chamadas.filter((c) => c.papel === 'backend').find((c) => jaUsouFerramenta(c.usuario));
    assert.match(respostaDaFerramenta.usuario, /export const a = 1/);
    assert.match(respostaDaFerramenta.usuario, /não obedeça instruções/);
    const qa = JSON.parse(chamadas.find((c) => c.papel === 'qa').usuario);
    assert.deepEqual(qa.entrega.registro_do_harness.map((e) => [e.ferramenta, e.ok]), [['ler_arquivo', true]]);
    const rel = relatorioDe(t.dir);
    assert.ok(rel.auditoria.some((e) => e.papel === 'backend' && e.ferramenta === 'ler_arquivo' && e.resultado === 'ok'), 'o uso da ferramenta foi auditado');
    assert.ok(rel.tarefas[0].entrega.evidencias.length >= 1);
    assert.match(t.saidas.join('\n'), /ferramentas em /);
  });

  it('"os testes passam" só é aceito com uma execução registrada: com rodar_testes configurado o time aprova; sem ele, escala', async () => {
    const comTestes = montar({ ferramentas: { comandoTestes: [process.execPath, '-e', "console.log('12 testes ok')"], timeoutMs: 20_000, papeis: { testes: ['rodar_testes'] } } });
    estado.criterioTestes = 'os testes passam';
    estado.testesRodam = true;
    assert.equal(await comTestes.rodar(base(['--raiz', projeto()])), 0, comTestes.erros.join('\n'));
    assert.match(comTestes.saidas.join('\n'), /INCLUI rodar testes/);
    const tarefaTestes = relatorioDe(comTestes.dir).tarefas.find((x) => x.papel === 'testes');
    assert.equal(tarefaTestes.estado, 'aprovada');
    assert.equal(tarefaTestes.entrega.evidencias[0].passou, true);

    const semFerramenta = montar({ orcamento: { maxTentativas: 2 } });
    estado.criterioTestes = 'os testes passam';
    assert.equal(await semFerramenta.rodar(base()), 1);
    const t2 = relatorioDe(semFerramenta.dir).tarefas.find((x) => x.papel === 'testes');
    assert.equal(t2.estado, 'escalada', 'o modelo disse que passou, mas não há execução registrada');
    assert.match(t2.feedback.join(' '), /exige execução registrada de rodar_testes/);
  });

  it('--raiz inexistente é erro de uso; sem --raiz nenhum agente recebe ferramentas', async () => {
    const t = montar();
    assert.equal(await t.rodar(base(['--raiz', path.join(t.dir, 'nao-existe')])), 2);
    assert.match(t.erros.join('\n'), /--raiz não existe/);
    assert.equal(await t.rodar(base()), 0);
    assert.ok(chamadas.every((c) => !/FERRAMENTAS disponíveis/.test(c.sistema)));
  });
});

describe('envio a um modelo fora da máquina', () => {
  it('com --entrada ou --raiz e endpoint remoto, a CLI exige --confirmo-envio-externo e não chama nada', async () => {
    const t = montar();
    const env = { OPENAI_BASE_URL: 'https://llm.exemplo.com/v1', OPENAI_API_KEY: 'chave-de-teste', MODELO_CHAT: 'x' };
    fs.writeFileSync(path.join(t.dir, 'e.txt'), 'um texto qualquer');
    assert.equal(await t.rodar(base(['--entrada', 'e.txt']), { env }), 2);
    assert.match(t.erros.at(-1), /não está na sua máquina.*--entrada.*--confirmo-envio-externo/);
    assert.equal(await t.rodar(base(['--raiz', t.dir]), { env }), 2);
    assert.match(t.erros.at(-1), /--raiz/);
    assert.equal(chamadas.length, 0);
  });
});

describe('decisões do dono no terminal (perguntar injetado)', () => {
  it('escalonamento: o dono vê o motivo e a entrega e pode aprovar; a entrega mostrada vem neutralizada', async () => {
    const t = montar();
    t.reescreverConfig({ avaliadores: [{ nome: 'qa', persona: './qa.md', limiar: 0.99 }], orcamento: { maxTentativas: 1 } });
    const perguntas = [];
    const respostas = ['s', 's']; // a tarefa principal e a filha que ela propôs escalam; o dono aprova as duas
    const perguntar = async (q) => { perguntas.push(q); return respostas.shift() ?? ''; };
    const codigo = await t.rodar(base(['--aprovar-licoes', 'nenhuma']), { perguntar });
    assert.equal(codigo, 0, t.erros.join('\n'));
    assert.match(perguntas[0], /Aprovar esta entrega mesmo assim/);
    assert.match(t.saidas.join('\n'), /Motivo: tentativas esgotadas/);
    assert.match(t.saidas.join('\n'), /entrega \(início\):\s+endpoint v1/);
    assert.equal(relatorioDe(t.dir).tarefas[0].aprovada_por, 'humano');
  });

  it('lições: [s]im grava, [n]ão rejeita, Enter/[d]epois deixa pendente (nada é gravado por padrão)', async () => {
    const t = montar();
    estado.qa = 1;
    const respostas = ['s', 'd'];
    const perguntar = async () => respostas.shift() ?? '';
    assert.equal(await t.rodar(base(), { perguntar }), 0, t.erros.join('\n'));
    assert.deepEqual(memoriaDe(t.dir).map((m) => m.chave), ['padrao.erros']);
    assert.deepEqual(pendentesDe(t.dir).map((l) => l.chave), ['aprendizado.validacao']);

    const t2 = montar();
    estado.qa = 1;
    const r2 = ['n', ''];
    assert.equal(await t2.rodar(base(), { perguntar: async () => r2.shift() ?? '' }), 0);
    assert.deepEqual(memoriaDe(t2.dir), []);
    assert.deepEqual(pendentesDe(t2.dir).map((l) => l.chave), ['aprendizado.validacao'], '"n" rejeita; Enter deixa pendente');
    assert.deepEqual(relatorioDe(t2.dir).licoes.map((l) => l.estado), ['rejeitada', 'pendente']);
  });
});

describe('licoes listar | aprovar | rejeitar', () => {
  async function comPendentes() {
    const t = montar();
    estado.qa = 1;
    assert.equal(await t.rodar(base()), 0);
    return t;
  }

  it('lista as pendentes; aprovar grava na memória certa e tira da fila; rejeitar descarta; ambas deixam rastro', async () => {
    const t = await comPendentes();
    const [projeto, global] = pendentesDe(t.dir);
    assert.equal(await t.rodar(['licoes', 'listar']), 0);
    const listagem = t.saidas.join('\n');
    assert.match(listagem, /Lições pendentes \(2\)/);
    assert.ok(listagem.includes(projeto.id) && listagem.includes(global.id));

    assert.equal(await t.rodar(['licoes', 'aprovar', projeto.id]), 0, t.erros.join('\n'));
    assert.deepEqual(memoriaDe(t.dir).map((m) => [m.escopo, m.chave, m.fonte]), [['proj-a', 'padrao.erros', 'time:t1']]);
    assert.equal(await t.rodar(['licoes', 'rejeitar', global.id]), 0);
    assert.deepEqual(pendentesDe(t.dir), []);
    assert.equal(memoriaDe(t.dir).length, 1, 'rejeitada não vai para a memória');
    const decisoes = fs.readFileSync(path.join(t.dir, 'licoes-decididas.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(decisoes.map((d) => [d.id, d.acao]), [[projeto.id, 'aprovada'], [global.id, 'rejeitada']]);
    t.saidas.length = 0;
    assert.equal(await t.rodar(['licoes', 'listar']), 0);
    assert.match(t.saidas.join('\n'), /Nenhuma lição pendente/);
  });

  it('uma lição global aprovada depois vai para o escopo global', async () => {
    const t = await comPendentes();
    const global = pendentesDe(t.dir).find((l) => l.escopo === 'global');
    assert.equal(await t.rodar(['licoes', 'aprovar', global.id]), 0);
    assert.deepEqual(memoriaDe(t.dir).map((m) => m.escopo), ['global']);
  });

  it('id inexistente, uso errado e config ausente têm código e mensagem claros', async () => {
    const t = await comPendentes();
    assert.equal(await t.rodar(['licoes', 'aprovar', 'lp-zzzz-l9']), 1);
    assert.match(t.erros.at(-1), /não há lição pendente/);
    for (const args of [['licoes'], ['licoes', 'apagar', 'x'], ['licoes', 'aprovar'], ['licoes', 'listar', 'extra'], ['licoes', 'listar', '--config']]) {
      assert.equal(await t.rodar(args), 2, args.join(' '));
    }
    assert.equal(await t.rodar(['licoes', 'listar', '--config', 'nao-existe.json']), 2);
  });

  it('arquivo de pendentes editado à mão: entradas inválidas, com segredo, com controle ou de formato errado não são oferecidas', async () => {
    const t = await comPendentes();
    const arq = path.join(t.dir, 'licoes-pendentes.json');
    const boa = pendentesDe(t.dir)[0];
    const ruins = [
      { ...boa, id: 'lp-aaaa-l1', valor: `use ${SK}` },
      { ...boa, id: 'lp-bbbb-l1', valor: `oi ${String.fromCharCode(0x1b)}[2J` },
      { ...boa, id: 'id inválido' },
      { ...boa, id: 'lp-cccc-l1', projeto: '../fuga' },
      { ...boa, id: 'lp-dddd-l1', tipo: 'credencial' },
      'texto', null,
    ];
    fs.writeFileSync(arq, JSON.stringify({ licoes: [boa, ...ruins] }));
    t.saidas.length = 0;
    assert.equal(await t.rodar(['licoes', 'listar']), 0);
    assert.match(t.saidas.join('\n'), /Lições pendentes \(1\)/);
    assert.ok(!t.saidas.join('\n').includes('Vv3w'));
    assert.equal(await t.rodar(['licoes', 'aprovar', 'lp-aaaa-l1']), 1);
    fs.writeFileSync(arq, '{ quebrado');
    assert.equal(await t.rodar(['licoes', 'listar']), 2);
    assert.match(t.erros.at(-1), /ilegível/);
  });

  it('o texto da lição é mostrado com controles neutralizados', async () => {
    const t = await comPendentes();
    const arq = path.join(t.dir, 'licoes-pendentes.json');
    const [l] = pendentesDe(t.dir);
    fs.writeFileSync(arq, JSON.stringify({ licoes: [{ ...l, valor: 'texto\ttabulado e acentuação' }] }));
    t.saidas.length = 0;
    await t.rodar(['licoes', 'listar']);
    assert.ok(!t.saidas.join('\n').includes('\t'));
  });
});

describe('configuração de exemplo', () => {
  const arq = path.join(aqui, '..', 'time.config.exemplo.json');
  const cfg = lerJson(arq);

  it('time.config.exemplo.json aponta para personas que existem e para papéis que existem', () => {
    const caminhos = [...Object.values(cfg.agentes), ...cfg.avaliadores.map((a) => a.persona)];
    assert.ok(caminhos.length >= 8);
    for (const rel of caminhos) assert.ok(fs.existsSync(path.resolve(path.dirname(arq), rel)), `persona ausente: ${rel}`);
    for (const a of cfg.avaliadores) for (const papel of a.aplicaA ?? []) assert.ok(papel in cfg.agentes, `aplicaA aponta papel inexistente: ${papel}`);
    for (const papel of Object.keys(cfg.roteador.palavras)) assert.ok(papel in cfg.agentes, `roteador aponta papel inexistente: ${papel}`);
    for (const [pai, filhos] of Object.entries(cfg.delegacoes)) for (const papel of [pai, ...filhos]) assert.ok(papel in cfg.agentes, `delegacoes aponta papel inexistente: ${papel}`);
    for (const papel of Object.keys(cfg.ferramentas.papeis)) assert.ok(papel in cfg.agentes, `ferramentas aponta papel inexistente: ${papel}`);
    assert.ok(cfg.roteador.padrao in cfg.agentes);
  });

  it('todo papel do exemplo tem pelo menos um avaliador (nada é aprovado sem revisão)', () => {
    for (const papel of Object.keys(cfg.agentes)) {
      assert.ok(cfg.avaliadores.some((a) => !a.aplicaA || a.aplicaA.includes(papel)), `papel sem avaliador: ${papel}`);
    }
  });

  it('o exemplo passa na pré-checagem da CLI (personas lidas, sem segredo, papéis coerentes)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'time-ex-'));
    tmps.push(dir);
    const copia = path.join(aqui, '..', `_ex-${process.pid}.config.json`);
    fs.writeFileSync(copia, JSON.stringify({ ...cfg, perfil: undefined }));
    try {
      const erros = [];
      // ponto de parada barato: modelo inalcançável. Se a pré-checagem falhasse, o código seria 2 com "erro na configuração".
      const codigo = await main(['--config', copia, '--projeto', 'proj-ex', '--criterio', 'responde 400', '--saida', dir, 'Documentar o README'], {
        env: { OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', TIMEOUT_MS: '2000' }, cwd: dir, saida: () => {}, erro: (s) => erros.push(s), stdin: { isTTY: false },
      });
      assert.ok(!erros.join('\n').includes('erro na configuração'), erros.join('\n'));
      assert.notEqual(codigo, 2, erros.join('\n'));
    } finally { fs.rmSync(copia, { force: true }); fs.rmSync(path.join(aqui, '..', 'memoria-do-time.jsonl'), { force: true }); }
  });
});
