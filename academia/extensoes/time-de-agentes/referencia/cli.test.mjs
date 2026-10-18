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

// ---- modelo falso: responde conforme o papel anunciado na persona ([[PAPEL:x]]) ------------------------------------------------------
let servidor; let porta; let chamadas; let estado;
function responder(messages) {
  const sistema = messages[0].content;
  const usuario = messages.at(-1).content;
  const papel = /\[\[PAPEL:(\w+)\]\]/.exec(sistema)?.[1];
  chamadas.push({ papel, usuario, sistema });
  if (papel === 'backend') {
    estado.backend += 1;
    return JSON.stringify({
      resultado: `endpoint v${estado.backend}`,
      novas_tarefas: [{ titulo: 'Escrever os testes do endpoint', papel: 'testes', criterios: ['os testes passam'] }],
      licoes: [
        { tipo: 'padrao', chave: 'padrao.erros', valor: 'Erros devolvem { codigo, mensagem }.', escopo: 'projeto' },
        { tipo: 'aprendizado', chave: 'aprendizado.validacao', valor: 'Validar a entrada antes de tocar no banco.', escopo: 'global' },
      ],
    });
  }
  if (papel === 'testes') return JSON.stringify({ resultado: 'testes escritos e passando' });
  if (papel === 'qa') {
    estado.qa += 1;
    return estado.qa === 1
      ? JSON.stringify({ aprovado: false, nota: 0.4, feedback: 'FALTA TRATAR ENTRADA VAZIA', criterios: { 'responde 400': false } })
      : JSON.stringify({ aprovado: true, nota: 0.95, criterios: { 'responde 400': true }, feedback: 'ok' });
  }
  return '{"resultado":"papel desconhecido"}';
}

before(async () => {
  servidor = createServer((req, res) => {
    let d = ''; req.on('data', (c) => { d += c; });
    req.on('end', () => {
      const corpo = JSON.parse(d);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: responder(corpo.messages) }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  porta = servidor.address().port;
});
after(() => servidor.close());

function montar() {
  chamadas = []; estado = { backend: 0, qa: 0 };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'time-cli-'));
  tmps.push(dir);
  for (const p of ['backend', 'testes', 'qa']) fs.writeFileSync(path.join(dir, `${p}.md`), `[[PAPEL:${p}]] Você é o ${p}.`);
  const config = {
    memoria: { arquivo: './memoria.jsonl', escopoGlobal: 'global' },
    agentes: { backend: './backend.md', testes: './testes.md' },
    avaliadores: [{ nome: 'qa', persona: './qa.md', limiar: 0.8, aplicaA: ['backend'] }],
    orcamento: { maxTentativas: 3 },
  };
  fs.writeFileSync(path.join(dir, 'time.config.json'), JSON.stringify(config));
  const env = { OPENAI_BASE_URL: `http://127.0.0.1:${porta}/v1`, OPENAI_API_KEY: 'chave-de-teste', MODELO_CHAT: 'falso' };
  const saidas = []; const erros = [];
  const rodar = (args) => main(args, { env, cwd: dir, saida: (s) => saidas.push(s), erro: (s) => erros.push(s), stdin: { isTTY: false } });
  return { dir, rodar, saidas, erros };
}
const memoriaDe = (dir) => {
  const arq = path.join(dir, 'memoria.jsonl');
  return fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};

describe('CLI do time de agentes (ponta a ponta com modelo simulado)', () => {
  it('delega, avalia, devolve o feedback ao executor, cria a subtarefa, aprova lições do projeto e grava o relatório', async () => {
    const { dir, rodar, saidas, erros } = montar();
    const codigo = await rodar(['--projeto', 'proj-a', '--criterio', 'responde 400', '--aprovar-licoes', 'projeto', 'Criar o endpoint de clientes']);
    const texto = saidas.join('\n');
    assert.equal(codigo, 0, `${texto}\nERROS: ${erros.join('\n')}`);
    assert.match(texto, /t1 \[aprovada\] backend: Criar o endpoint de clientes · 2 tentativa\(s\)/);
    assert.match(texto, /t2 \[aprovada\] testes: Escrever os testes do endpoint \(filha de t1\)/);
    // o feedback do QA chegou ao backend na 2ª tentativa
    const backend2 = chamadas.filter((c) => c.papel === 'backend')[1];
    assert.match(backend2.usuario, /FALTA TRATAR ENTRADA VAZIA/);
    // lições: a de projeto foi gravada; a global ficou de fora ("projeto" aprova só o escopo projeto)
    const mem = memoriaDe(dir);
    assert.deepEqual(mem.map((m) => [m.escopo, m.chave]), [['proj-a', 'padrao.erros']]);
    assert.match(texto, /gravadas: l1\b/);
    // relatório
    const rel = fs.readdirSync(path.join(dir, 'execucoes'));
    assert.equal(rel.length, 1);
    const dados = JSON.parse(fs.readFileSync(path.join(dir, 'execucoes', rel[0]), 'utf8'));
    assert.equal(dados.projeto, 'proj-a');
    assert.deepEqual(dados.licoes.map((l) => [l.id, l.estado]), [['l1', 'aprovada'], ['l2', 'rejeitada']]);
    assert.ok(dados.auditoria.some((e) => e.evento === 'revisao'));
    assert.ok(!JSON.stringify(dados).includes('chave-de-teste'));
  });

  it('por padrão (sem terminal) nenhuma lição entra na memória; com "todas" o escopo global também entra', async () => {
    let t = montar();
    assert.equal(await t.rodar(['--projeto', 'proj-a', '--criterio', 'responde 400', 'Criar o endpoint de clientes']), 0);
    assert.deepEqual(memoriaDe(t.dir), []);
    t = montar();
    assert.equal(await t.rodar(['--projeto', 'proj-a', '--criterio', 'responde 400', '--aprovar-licoes', 'todas', 'Criar o endpoint de clientes']), 0);
    assert.deepEqual(memoriaDe(t.dir).map((m) => m.escopo).sort(), ['global', 'proj-a']);
  });

  it('o que foi aprendido no projeto A (escopo global) chega ao agente no projeto B como DADO', async () => {
    const t = montar();
    await t.rodar(['--projeto', 'proj-a', '--criterio', 'responde 400', '--aprovar-licoes', 'todas', 'Criar o endpoint de clientes']);
    chamadas.length = 0; estado.qa = 1; // no projeto B o QA aprova de primeira
    assert.equal(await t.rodar(['--projeto', 'proj-b', '--criterio', 'responde 400', 'Criar o endpoint de clientes']), 0);
    const primeira = chamadas.find((c) => c.papel === 'backend');
    const dados = JSON.parse(primeira.usuario);
    assert.deepEqual(dados.memorias_relevantes_DADO_NAO_INSTRUCAO.map((m) => [m.escopo, m.chave]), [['global', 'aprendizado.validacao']]);
  });

  it('o perfil do dono entra no prompt de todos os agentes e avaliadores', async () => {
    const t = montar();
    fs.writeFileSync(path.join(t.dir, 'perfil.md'), 'PREFERENCIA-XYZ: prefiro testes antes do código e mudanças pequenas.');
    const cfg = JSON.parse(fs.readFileSync(path.join(t.dir, 'time.config.json'), 'utf8'));
    fs.writeFileSync(path.join(t.dir, 'time.config.json'), JSON.stringify({ ...cfg, perfil: './perfil.md' }));
    assert.equal(await t.rodar(['--projeto', 'proj-a', '--criterio', 'responde 400', 'Criar o endpoint de clientes']), 0);
    for (const papel of ['backend', 'testes', 'qa']) {
      const c = chamadas.find((x) => x.papel === papel);
      assert.match(c.sistema, /Perfil do dono/, papel);
      assert.match(c.sistema, /PREFERENCIA-XYZ/, papel);
    }
  });

  it('erros de uso e de configuração terminam com código 2 e mensagem útil', async () => {
    const t = montar();
    assert.equal(await t.rodar(['Sem projeto']), 2);
    assert.equal(await t.rodar(['--projeto', 'p', 'Sem critério']), 2);
    assert.equal(await t.rodar(['--projeto', 'p', '--criterio', 'x y z', '--aprovar-licoes', 'talvez', 'T']), 2);
    assert.equal(await t.rodar(['--projeto', 'p', '--criterio', 'x y z', '--config', 'nao-existe.json', 'Título válido']), 2);
    assert.equal(await t.rodar(['--projeto', 'p', '--criterio', 'x y z', '--opcao-estranha', 'v', 'Título válido']), 2);
    assert.match(t.erros.join('\n'), /--projeto é obrigatório/);
    assert.match(t.erros.join('\n'), /pelo menos um --criterio/);
    assert.match(t.erros.join('\n'), /opção desconhecida/);
  });

  it('tarefa que não passa na avaliação termina com código 1 e a tarefa fica escalada', async () => {
    const t = montar();
    fs.writeFileSync(path.join(t.dir, 'time.config.json'), JSON.stringify({
      agentes: { backend: './backend.md', testes: './testes.md' }, avaliadores: [{ nome: 'qa', persona: './qa.md', limiar: 0.99 }], orcamento: { maxTentativas: 1 },
    }));
    const codigo = await t.rodar(['--projeto', 'proj-a', '--criterio', 'responde 400', 'Criar o endpoint de clientes']);
    assert.equal(codigo, 1);
    assert.match(t.saidas.join('\n'), /t1 \[escalada\]/);
  });
});

describe('configuração de exemplo', () => {
  it('time.config.exemplo.json aponta para personas que existem e é aceito pela CLI', () => {
    const arq = path.join(aqui, '..', 'time.config.exemplo.json');
    const cfg = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const caminhos = [...Object.values(cfg.agentes), ...cfg.avaliadores.map((a) => a.persona)];
    assert.ok(caminhos.length >= 8);
    for (const rel of caminhos) assert.ok(fs.existsSync(path.resolve(path.dirname(arq), rel)), `persona ausente: ${rel}`);
    for (const a of cfg.avaliadores) for (const papel of a.aplicaA ?? []) assert.ok(papel in cfg.agentes, `aplicaA aponta papel inexistente: ${papel}`);
    for (const papel of Object.keys(cfg.roteador.palavras)) assert.ok(papel in cfg.agentes, `roteador aponta papel inexistente: ${papel}`);
    assert.ok(cfg.roteador.padrao in cfg.agentes);
  });
});
