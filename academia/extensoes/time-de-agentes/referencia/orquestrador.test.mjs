// Testes do orquestrador com agentes simulados (determinísticos, sem LLM).
//   node --test academia/extensoes/time-de-agentes/referencia/orquestrador.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { criarMemoria } from '../../memoria-persistente-mcp/referencia/memoria.mjs';
import { criarOrquestrador, roteadorPorPalavrasChave } from './orquestrador.mjs';

const tmps = [];
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }); });

const tarefa = (extra = {}) => ({ titulo: 'Criar o endpoint de clientes', criterios: ['responde 400 para entrada inválida', 'há testes'], papel: 'backend', ...extra });
const faz = (resultado = 'feito', extra = {}) => async () => ({ resultado, ...extra });
const aprova = (nome = 'qa') => ({ nome, avaliar: async () => ({ aprovado: true, nota: 0.9, feedback: 'ok' }) });
const estados = (r) => Object.fromEntries(r.tarefas.map((t) => [t.titulo, t.estado]));

describe('fluxo básico', () => {
  it('executa, avalia e aprova; registra auditoria', async () => {
    const eventos = [];
    const orq = criarOrquestrador({ agentes: { backend: faz('endpoint pronto') }, avaliadores: [aprova()], auditoria: (e) => eventos.push(e) });
    const r = await orq.executar(tarefa());
    assert.equal(r.parada, 'concluido');
    assert.equal(r.tarefas[0].estado, 'aprovada');
    assert.equal(r.tarefas[0].aprovada_por, 'avaliadores');
    assert.equal(r.chamadas, 2);
    assert.deepEqual(eventos.map((e) => e.evento), ['tarefa_criada', 'execucao', 'avaliacao', 'aprovada', 'fim']);
  });

  it('exige critérios, papel conhecido e texto sem segredo na tarefa inicial', async () => {
    const orq = criarOrquestrador({ agentes: { backend: faz() } });
    await assert.rejects(orq.executar({ titulo: 'sem critérios', papel: 'backend', criterios: [] }), /criterios_invalidos/);
    await assert.rejects(orq.executar(tarefa({ papel: 'astronauta' })), /papel_desconhecido/);
    await assert.rejects(orq.executar(tarefa({ criterios: ['usar a chave sk-' + 'Zq9x'.repeat(6)] })), /segredo_na_tarefa/);
  });

  it('configuração inválida é recusada', () => {
    assert.throws(() => criarOrquestrador({ agentes: {} }), /ao menos um papel/);
    assert.throws(() => criarOrquestrador({ agentes: { a: 1 } }), /funcao/);
    assert.throws(() => criarOrquestrador({ agentes: { a: faz() }, avaliadores: [{ nome: 'x' }] }), /avaliar/);
    assert.throws(() => criarOrquestrador({ agentes: { a: faz() }, memoria: {} }), /escopoProjeto/);
  });
});

describe('avaliação em cadeia e revisão (evaluator-optimizer)', () => {
  it('reprovação devolve o feedback ao executor, que refaz; depois o próximo avaliador também precisa aprovar', async () => {
    const vistos = [];
    const agente = async (_t, ctx) => { vistos.push({ tentativa: ctx.tentativa, feedback: ctx.feedback }); return { resultado: `versão ${ctx.tentativa}` }; };
    const chamadasQa = [];
    const qa = { nome: 'qa', avaliar: async (_t, entrega) => { chamadasQa.push(entrega.resultado); return entrega.resultado === 'versão 1' ? { aprovado: false, nota: 0.4, feedback: 'falta tratar entrada vazia' } : { aprovado: true, nota: 0.9 }; } };
    const seguranca = { nome: 'seguranca', avaliar: async () => ({ aprovado: true, nota: 1 }) };
    const r = await criarOrquestrador({ agentes: { backend: agente }, avaliadores: [qa, seguranca] }).executar(tarefa());
    assert.equal(r.tarefas[0].estado, 'aprovada');
    assert.equal(r.tarefas[0].tentativas, 2);
    assert.deepEqual(vistos[1].feedback, ['qa: falta tratar entrada vazia']);
    assert.deepEqual(chamadasQa, ['versão 1', 'versão 2']);
    assert.deepEqual(r.tarefas[0].avaliacoes.map((a) => [a.avaliador, a.tentativa, a.aprovado]), [['qa', 1, false], ['qa', 2, true], ['seguranca', 2, true]]);
  });

  it('se o segundo avaliador reprova, a tarefa volta para o executor mesmo que o primeiro tenha aprovado', async () => {
    let n = 0;
    const seguranca = { nome: 'seguranca', avaliar: async () => (++n === 1 ? { aprovado: false, feedback: 'sanitize a entrada' } : { aprovado: true }) };
    const r = await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [aprova('qa'), seguranca] }).executar(tarefa());
    assert.equal(r.tarefas[0].estado, 'aprovada');
    assert.equal(r.tarefas[0].tentativas, 2);
  });

  it('esgotadas as tentativas a tarefa é escalada', async () => {
    const reprova = { nome: 'qa', avaliar: async () => ({ aprovado: false, feedback: 'ainda errado' }) };
    const r = await criarOrquestrador({ agentes: { backend: faz('ruim') }, avaliadores: [reprova], orcamento: { maxTentativas: 2 } }).executar(tarefa());
    assert.equal(r.tarefas[0].estado, 'escalada');
    assert.equal(r.tarefas[0].tentativas, 2);
    assert.match(r.tarefas[0].motivo, /tentativas esgotadas/);
  });

  it('tarefas que dependem de uma tarefa escalada ficam bloqueadas, não executam', async () => {
    let executou = false;
    const plano = faz('plano', { novas_tarefas: [
      { titulo: 'Implementar a API', papel: 'backend', criterios: ['responde'] },
      { titulo: 'Escrever os testes', papel: 'testes', criterios: ['passam'], depende_de: [0] },
    ] });
    const qa = { nome: 'qa', aplicaA: (t) => t.papel === 'backend', avaliar: async () => ({ aprovado: false, feedback: 'ruim' }) };
    const r = await criarOrquestrador({
      agentes: { gerente: plano, backend: faz('api'), testes: async () => { executou = true; return { resultado: 'x' }; } }, avaliadores: [qa], orcamento: { maxTentativas: 1 },
    }).executar(tarefa({ papel: 'gerente', titulo: 'Plano' }));
    assert.deepEqual(estados(r), { Plano: 'aprovada', 'Implementar a API': 'escalada', 'Escrever os testes': 'bloqueada' });
    assert.equal(executou, false);
    assert.match(r.tarefas[2].motivo, /dependência t2/);
  });

  it('o humano pode aprovar uma tarefa escalada (e as tarefas propostas por ela passam a existir)', async () => {
    const reprova = { nome: 'qa', avaliar: async () => ({ aprovado: false, feedback: 'discordo' }) };
    const pedidos = [];
    const agentes = { backend: faz('entrega', { novas_tarefas: [{ titulo: 'Documentar o endpoint', papel: 'docs', criterios: ['README atualizado'] }] }), docs: faz() };
    const orq = criarOrquestrador({
      agentes, avaliadores: [{ nome: 'qa', aplicaA: (t) => t.papel === 'backend', avaliar: reprova.avaliar }], orcamento: { maxTentativas: 1 },
      humano: async (info) => { pedidos.push(info); return { acao: 'aprovar' }; },
    });
    const r = await orq.executar(tarefa());
    assert.equal(r.tarefas[0].estado, 'aprovada');
    assert.equal(r.tarefas[0].aprovada_por, 'humano');
    assert.equal(pedidos.length, 1);
    assert.deepEqual(pedidos[0].feedback, ['qa: discordo']);
    assert.deepEqual(estados(r), { 'Criar o endpoint de clientes': 'aprovada', 'Documentar o endpoint': 'aprovada' });
  });

  it('executor que lança erro ou devolve lixo conta como tentativa falha; avaliador que falha reprova', async () => {
    let n = 0;
    const agente = async () => { n += 1; if (n === 1) throw new Error('caiu a conexão sk-' + 'Hh7k'.repeat(6)); if (n === 2) return { resultado: '' }; return { resultado: 'agora sim' }; };
    const r = await criarOrquestrador({ agentes: { backend: agente }, avaliadores: [aprova()] }).executar(tarefa());
    assert.equal(r.tarefas[0].estado, 'aprovada');
    assert.equal(r.tarefas[0].tentativas, 3);
    const ruim = { nome: 'ruim', avaliar: async () => 'não é objeto' };
    const r2 = await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [ruim], orcamento: { maxTentativas: 1 } }).executar(tarefa());
    assert.equal(r2.tarefas[0].estado, 'escalada');
    assert.match(r2.tarefas[0].feedback[0], /avaliador ruim falhou/);
  });
});

describe('delegação e criação de tarefas (orchestrator-workers)', () => {
  const plano = (itens) => faz('decomposto', { novas_tarefas: itens });
  const filhos = [
    { titulo: 'Modelar o banco', papel: 'database', criterios: ['schema criado'] },
    { titulo: 'Implementar a API', papel: 'backend', criterios: ['endpoints respondem'], depende_de: [0] },
    { titulo: 'Escrever os testes', papel: 'testes', criterios: ['testes passam'], depende_de: [1] },
  ];

  it('cria subtarefas, respeita as dependências e executa na ordem certa', async () => {
    const ordem = [];
    const ag = (nome, extra) => async (t) => { ordem.push(nome); return extra ? extra(t) : { resultado: nome }; };
    const r = await criarOrquestrador({
      agentes: { manager: ag('manager', () => plano(filhos)()), database: ag('db'), backend: ag('api'), testes: ag('testes') }, avaliadores: [aprova()],
    }).executar(tarefa({ papel: 'manager', titulo: 'Feature de clientes' }));
    assert.deepEqual(ordem, ['manager', 'db', 'api', 'testes']);
    assert.deepEqual(r.tarefas.map((t) => [t.id, t.pai, t.profundidade, t.depende_de]), [['t1', null, 0, []], ['t2', 't1', 1, []], ['t3', 't1', 1, ['t2']], ['t4', 't1', 1, ['t3']]]);
    assert.ok(r.tarefas.every((t) => t.estado === 'aprovada'));
  });

  it('não cria tarefas de uma tentativa reprovada (só da aprovada)', async () => {
    let n = 0;
    const agente = async () => { n += 1; return { resultado: `v${n}`, novas_tarefas: [{ titulo: `Filha da v${n}`, papel: 'testes', criterios: ['ok ok'] }] }; };
    const qa = { nome: 'qa', aplicaA: (t) => t.papel === 'backend', avaliar: async (_t, e) => ({ aprovado: e.resultado === 'v2', feedback: 'refaça' }) };
    const r = await criarOrquestrador({ agentes: { backend: agente, testes: faz() }, avaliadores: [qa] }).executar(tarefa());
    assert.deepEqual(r.tarefas.map((t) => t.titulo), ['Criar o endpoint de clientes', 'Filha da v2']);
  });

  it('avaliador também pode pedir tarefas de acompanhamento ao aprovar', async () => {
    const qa = { nome: 'qa', avaliar: async () => ({ aprovado: true, novas_tarefas: [{ titulo: 'Cobrir o caso de borda', papel: 'testes', criterios: ['caso coberto'] }] }) };
    const r = await criarOrquestrador({ agentes: { backend: faz(), testes: faz() }, avaliadores: [{ ...qa, aplicaA: (t) => t.papel === 'backend' }] }).executar(tarefa());
    assert.deepEqual(r.tarefas.map((t) => [t.titulo, t.estado]), [['Criar o endpoint de clientes', 'aprovada'], ['Cobrir o caso de borda', 'aprovada']]);
  });

  it('rejeita propostas inválidas, duplicadas, com segredo, com papel desconhecido e com dependência inventada', async () => {
    const propostas = [
      { titulo: 'ok', papel: 'testes', criterios: ['x'] }, // título curto
      { titulo: 'Sem critérios', papel: 'testes', criterios: [] },
      { titulo: 'Papel inexistente', papel: 'mago', criterios: ['funciona'] },
      { titulo: 'Usar chave sk-' + 'Zq9x'.repeat(6), papel: 'testes', criterios: ['funciona'] },
      { titulo: 'Depende do nada', papel: 'testes', criterios: ['funciona'], depende_de: ['t99'] },
      { titulo: 'Depende do futuro', papel: 'testes', criterios: ['funciona'], depende_de: [5] },
      { titulo: 'Boa tarefa de testes', papel: 'testes', criterios: ['testes passam'] },
      { titulo: 'BOA tarefa de testes', papel: 'testes', criterios: ['testes passam'] }, // duplicada (caixa)
    ];
    const r = await criarOrquestrador({ agentes: { manager: plano(propostas), testes: faz() }, avaliadores: [aprova()] }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.deepEqual(r.tarefas.map((t) => t.titulo), ['Plano', 'Boa tarefa de testes']);
    assert.deepEqual(r.rejeitadas.map((x) => x.motivo), ['titulo_invalido', 'criterios_invalidos', 'papel_desconhecido', 'segredo_na_tarefa', 'dependencia_invalida', 'dependencia_invalida', 'duplicada']);
  });

  it('o orçamento impede a explosão de tarefas: limite total e profundidade máxima', async () => {
    const recursivo = async (t) => ({ resultado: 'mais uma', novas_tarefas: [{ titulo: `Nível ${t.profundidade + 1}`, papel: 'manager', criterios: ['continua'] }] });
    const r = await criarOrquestrador({ agentes: { manager: recursivo }, avaliadores: [aprova()], orcamento: { maxProfundidade: 2 } }).executar(tarefa({ papel: 'manager', titulo: 'Nível 0' }));
    assert.deepEqual(r.tarefas.map((t) => t.profundidade), [0, 1, 2]);
    assert.equal(r.rejeitadas.at(-1).motivo, 'profundidade_excedida');

    const larga = async () => ({ resultado: 'muitas', novas_tarefas: Array.from({ length: 10 }, (_, i) => ({ titulo: `Subtarefa ${i}`, papel: 'testes', criterios: ['feito'] })) });
    const r2 = await criarOrquestrador({ agentes: { manager: larga, testes: faz() }, avaliadores: [aprova()], orcamento: { maxTarefas: 4 } }).executar(tarefa({ papel: 'manager', titulo: 'Plano grande' }));
    assert.equal(r2.tarefas.length, 4);
    assert.ok(r2.rejeitadas.every((x) => x.motivo === 'limite_de_tarefas'));
  });

  it('o limite de chamadas para a execução e marca o resto como não executado', async () => {
    const propostas = Array.from({ length: 5 }, (_, i) => ({ titulo: `Tarefa extra ${i}`, papel: 'testes', criterios: ['feito'] }));
    const r = await criarOrquestrador({ agentes: { manager: plano(propostas), testes: faz() }, avaliadores: [aprova()], orcamento: { maxChamadas: 6 } }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.equal(r.parada, 'orcamento_de_chamadas');
    assert.ok(r.chamadas <= 6);
    assert.ok(r.tarefas.some((t) => t.estado === 'nao_executada'));
    assert.ok(r.tarefas.filter((t) => t.estado === 'aprovada').length >= 1);
  });

  it('roteador por palavras-chave escolhe o papel de propostas sem papel', async () => {
    const roteador = roteadorPorPalavrasChave({ testes: ['teste', 'cobertura'], docs: ['readme', 'documentar'] }, 'backend');
    const propostas = [{ titulo: 'Ampliar a cobertura de testes', criterios: ['cobertura sobe'] }, { titulo: 'Documentar o README', criterios: ['README ok'] }, { titulo: 'Refatorar o módulo', criterios: ['sem regressão'] }];
    const r = await criarOrquestrador({ agentes: { manager: plano(propostas), testes: faz(), docs: faz(), backend: faz() }, avaliadores: [aprova()], roteador }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.deepEqual(r.tarefas.slice(1).map((t) => t.papel), ['testes', 'docs', 'backend']);
  });
});

describe('aprendizado entre projetos', () => {
  function comMemoria() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'time-'));
    tmps.push(d);
    return criarMemoria({ arquivo: path.join(d, 'm.jsonl'), escoposPermitidos: ['global', 'proj-a', 'proj-b'] });
  }
  const licoes = [
    { tipo: 'padrao', chave: 'padrao.erros', valor: 'Erros da API sempre devolvem { codigo, mensagem }.', escopo: 'global' },
    { tipo: 'decisao', chave: 'decisao.banco', valor: 'Usar PostgreSQL neste projeto.', escopo: 'projeto' },
    { tipo: 'aprendizado', chave: 'Chave Inválida', valor: 'chave com espaço', escopo: 'projeto' },
    { tipo: 'aprendizado', chave: 'aprendizado.token', valor: 'a chave é sk-' + 'Zq9x'.repeat(6), escopo: 'projeto' },
  ];

  it('lições ficam PENDENTES: nada entra na memória sem aprovação, e a aprovação respeita o escopo pedido', async () => {
    const memoria = comMemoria();
    const orq = criarOrquestrador({ agentes: { backend: faz('ok', { licoes }) }, avaliadores: [aprova()], memoria, escopoProjeto: 'proj-a' });
    const r = await orq.executar(tarefa());
    assert.deepEqual(r.licoes.map((l) => [l.id, l.chave, l.estado]), [['l1', 'padrao.erros', 'pendente'], ['l2', 'decisao.banco', 'pendente']], 'formato inválido e segredo foram descartados');
    assert.equal(memoria.buscar({ escopo: 'global' }).total, 0);
    orq.aprovarLicao('l1');
    orq.aprovarLicao('l2');
    assert.deepEqual(memoria.buscar({ escopo: 'global' }).itens.map((i) => i.chave), ['padrao.erros']);
    assert.deepEqual(memoria.buscar({ escopo: 'proj-a' }).itens.map((i) => i.chave), ['decisao.banco']);
    assert.equal(memoria.buscar({ escopo: 'proj-a' }).itens[0].fonte, 'time:t1');
    assert.throws(() => orq.aprovarLicao('l1'), /já foi aprovada/);
    assert.throws(() => orq.aprovarLicao('l9'), /não existe/);
  });

  it('o que foi aprendido em um projeto chega como contexto (DADO) em outro projeto, sem vazar o escopo do primeiro', async () => {
    const memoria = comMemoria();
    const a = criarOrquestrador({ agentes: { backend: faz('ok', { licoes }) }, avaliadores: [aprova()], memoria, escopoProjeto: 'proj-a' });
    await a.executar(tarefa());
    a.aprovarLicao('l1'); a.aprovarLicao('l2');
    let recebido;
    const b = criarOrquestrador({ agentes: { backend: async (_t, ctx) => { recebido = ctx.memorias; return { resultado: 'ok' }; } }, avaliadores: [aprova()], memoria, escopoProjeto: 'proj-b' });
    await b.executar(tarefa({ titulo: 'Criar a API de erros e a decisão do banco' }));
    assert.deepEqual(recebido.map((m) => [m.escopo, m.chave]), [['global', 'padrao.erros']], 'o global chega; o projeto A não');
  });

  it('rejeitar uma lição a descarta; sem memória configurada não há como gravar', async () => {
    const memoria = comMemoria();
    const orq = criarOrquestrador({ agentes: { backend: faz('ok', { licoes }) }, avaliadores: [aprova()], memoria, escopoProjeto: 'proj-a' });
    await orq.executar(tarefa());
    assert.equal(orq.rejeitarLicao('l1').estado, 'rejeitada');
    assert.throws(() => orq.aprovarLicao('l1'), /já foi rejeitada/);
    const sem = criarOrquestrador({ agentes: { backend: faz('ok', { licoes }) }, avaliadores: [aprova()] });
    await sem.executar(tarefa());
    assert.throws(() => sem.aprovarLicao('l1'), /sem memória/);
  });
});
