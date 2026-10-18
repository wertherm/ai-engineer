// Testes adversariais do orquestrador: política de avaliador, orçamento, delegação, segredos, falhas das funções injetadas.
//   node --test academia/extensoes/time-de-agentes/referencia/orquestrador.robustez.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { criarMemoria } from '../../memoria-persistente-mcp/referencia/memoria.mjs';
import { criarOrquestrador, gravarLicao, motivoDaLicao, ORCAMENTO_PADRAO, roteadorPorPalavrasChave } from './orquestrador.mjs';

const tmps = [];
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }); });
const ESC = String.fromCharCode(0x1b);
const BIDI = String.fromCharCode(0x202e);
const SK = `sk-${'Rr6s'.repeat(8)}`;

const tarefa = (extra = {}) => ({ titulo: 'Criar o endpoint de clientes', criterios: ['responde 400 para entrada inválida', 'há testes'], papel: 'backend', ...extra });
const faz = (resultado = 'feito', extra = {}) => async () => ({ resultado, ...extra });
const aprova = (nome = 'qa', extra = {}) => ({ nome, avaliar: async () => ({ aprovado: true, nota: 0.9, feedback: 'ok' }), ...extra });
const reprova = (nome = 'qa') => ({ nome, avaliar: async () => ({ aprovado: false, feedback: 'não está bom ainda' }) });
const eventosDe = () => { const l = []; return { l, auditoria: (e) => l.push(e) }; };

describe('sem avaliador, sem aprovação automática', () => {
  it('tarefa sem avaliador aplicável fica ESCALADA (nada é aprovado por omissão)', async () => {
    const { l, auditoria } = eventosDe();
    const r = await criarOrquestrador({ agentes: { backend: faz() }, auditoria }).executar(tarefa());
    assert.equal(r.tarefas[0].estado, 'escalada');
    assert.match(r.tarefas[0].motivo, /nenhum avaliador/);
    assert.ok(l.some((e) => e.evento === 'sem_avaliador'));
  });

  it('com humano configurado, ele decide; sem a palavra "aprovar" continua escalada', async () => {
    const pedidos = [];
    const orq = (acao) => criarOrquestrador({ agentes: { backend: faz() }, humano: async (info) => { pedidos.push(info); return { acao }; } });
    assert.equal((await orq('aprovar').executar(tarefa())).tarefas[0].aprovada_por, 'humano');
    assert.equal((await orq('rejeitar').executar(tarefa())).tarefas[0].estado, 'escalada');
    assert.equal((await orq('talvez').executar(tarefa())).tarefas[0].estado, 'escalada');
    assert.match(pedidos[0].motivo, /nenhum avaliador/);
  });

  it('aprovarSemAvaliador liga a aprovação de propósito e deixa rastro', async () => {
    const { l, auditoria } = eventosDe();
    const r = await criarOrquestrador({ agentes: { backend: faz() }, aprovarSemAvaliador: true, auditoria }).executar(tarefa());
    assert.equal(r.tarefas[0].aprovada_por, 'sem_avaliador');
    assert.ok(l.some((e) => e.evento === 'sem_avaliador'));
  });

  it('um avaliador cujo aplicaA lança exceção continua se aplicando (na dúvida, avalia)', async () => {
    const r = await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [aprova('qa', { aplicaA: () => { throw new Error('bug'); } })] }).executar(tarefa());
    assert.equal(r.tarefas[0].aprovada_por, 'avaliadores');
  });
});

describe('orçamento validado e respeitado nos limites', () => {
  it('recusa campos desconhecidos e valores sem sentido (NaN, Infinity, 0, negativo, texto, decimal, acima do teto)', () => {
    const cria = (orcamento) => () => criarOrquestrador({ agentes: { backend: faz() }, orcamento });
    assert.throws(cria({ maxTentativa: 3 }), /campo desconhecido/);
    for (const v of [NaN, Infinity, 0, -1, '3', 1.5, null, undefined, 101]) {
      assert.throws(cria({ maxTentativas: v }), /maxTentativas/, String(v));
    }
    assert.throws(cria({ maxChamadas: 1001 }), /maxChamadas/);
    assert.throws(cria({ timeoutMs: 0 }), /timeoutMs/);
    assert.throws(cria(null), /orcamento deve ser/);
    assert.throws(cria([]), /orcamento deve ser/);
    assert.ok(cria({ maxProfundidade: 0, maxFilhas: 0, maxLicoes: 0 }), 'zero é válido onde faz sentido');
    assert.equal(ORCAMENTO_PADRAO.maxTentativas, 3);
  });

  it('maxTentativas: executa exatamente N vezes antes de escalar', async () => {
    for (const n of [1, 2, 4]) {
      let execucoes = 0;
      const r = await criarOrquestrador({ agentes: { backend: async () => { execucoes += 1; return { resultado: 'x' }; } }, avaliadores: [reprova()], orcamento: { maxTentativas: n } }).executar(tarefa());
      assert.equal(execucoes, n);
      assert.equal(r.tarefas[0].tentativas, n);
      assert.equal(r.chamadas, 2 * n);
    }
  });

  it('maxChamadas: nunca passa do teto, inclusive no meio da cadeia de avaliadores', async () => {
    for (const teto of [1, 2, 3, 4]) {
      let chamadas = 0;
      const conta = (nome) => ({ nome, avaliar: async () => { chamadas += 1; return { aprovado: true }; } });
      const r = await criarOrquestrador({
        agentes: { backend: async () => { chamadas += 1; return { resultado: 'x' }; } }, avaliadores: [conta('a'), conta('b'), conta('c')], orcamento: { maxChamadas: teto },
      }).executar(tarefa());
      assert.ok(chamadas <= teto, `teto ${teto}: ${chamadas} chamadas`);
      assert.equal(r.chamadas, chamadas);
      if (teto < 4) assert.notEqual(r.tarefas[0].estado, 'aprovada', 'sem orçamento para a cadeia inteira, não aprova');
    }
  });

  it('maxFilhas limita as tarefas criadas por UMA tarefa', async () => {
    const filhos = Array.from({ length: 8 }, (_, i) => ({ titulo: `Subtarefa número ${i}`, papel: 'testes', criterios: ['feito'] }));
    const r = await criarOrquestrador({ agentes: { manager: faz('plano', { novas_tarefas: filhos }), testes: faz() }, avaliadores: [aprova()], orcamento: { maxFilhas: 3 } }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.equal(r.tarefas.length, 4);
    assert.ok(r.rejeitadas.every((x) => x.motivo === 'limite_de_filhas'));
  });

  it('só as primeiras 8 propostas de uma entrega são consideradas', async () => {
    const filhos = Array.from({ length: 20 }, (_, i) => ({ titulo: `Subtarefa número ${i}`, papel: 'testes', criterios: ['feito'] }));
    const r = await criarOrquestrador({ agentes: { manager: faz('plano', { novas_tarefas: filhos }), testes: faz() }, avaliadores: [aprova()], orcamento: { maxFilhas: 20 } }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.equal(r.tarefas.length, 9);
  });

  it('maxProfundidade 0 impede qualquer delegação', async () => {
    const r = await criarOrquestrador({ agentes: { manager: faz('plano', { novas_tarefas: [{ titulo: 'Filha', papel: 'manager', criterios: ['feito'] }] }) }, avaliadores: [aprova()], orcamento: { maxProfundidade: 0 } }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.equal(r.tarefas.length, 1);
    assert.equal(r.rejeitadas[0].motivo, 'profundidade_excedida');
  });

  it('tempo por chamada: agente ou avaliador pendurado vira tentativa falha, não trava a execução', async () => {
    const pendurado = () => new Promise(() => {});
    const r1 = await criarOrquestrador({ agentes: { backend: pendurado }, avaliadores: [aprova()], orcamento: { maxTentativas: 1, timeoutMs: 30 } }).executar(tarefa());
    assert.equal(r1.tarefas[0].estado, 'escalada');
    assert.match(r1.tarefas[0].feedback[0], /tempo esgotado/);
    const r2 = await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [{ nome: 'lento', avaliar: pendurado }], orcamento: { maxTentativas: 1, timeoutMs: 30 } }).executar(tarefa());
    assert.match(r2.tarefas[0].feedback[0], /avaliador lento falhou.*tempo esgotado/);
  });

  it('o sinal de cancelamento chega ao agente quando o tempo esgota', async () => {
    let abortado = false;
    await criarOrquestrador({
      agentes: { backend: (_t, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => { abortado = true; rej(new Error('abortado')); })) },
      avaliadores: [aprova()], orcamento: { maxTentativas: 1, timeoutMs: 20 },
    }).executar(tarefa());
    assert.equal(abortado, true);
  });
});

describe('delegação controlada', () => {
  const plano = (itens) => faz('plano', { novas_tarefas: itens });
  const filhas = [{ titulo: 'Escrever os testes', papel: 'testes', criterios: ['passam'] }, { titulo: 'Mexer na infraestrutura', papel: 'devops', criterios: ['aplicado'] }];

  it('com `delegacoes`, cada papel só cria tarefas para os papéis liberados', async () => {
    const r = await criarOrquestrador({
      agentes: { manager: plano(filhas), testes: faz(), devops: faz() }, avaliadores: [aprova()], delegacoes: { manager: ['testes'] },
    }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.deepEqual(r.tarefas.map((t) => t.titulo), ['Plano', 'Escrever os testes']);
    assert.deepEqual(r.rejeitadas.map((x) => x.motivo), ['delegacao_nao_permitida']);
  });

  it('papel sem entrada em `delegacoes` não delega nada (inclusive nomes como constructor)', async () => {
    const r = await criarOrquestrador({
      agentes: { manager: plano(filhas), testes: faz(), devops: faz() }, avaliadores: [aprova()], delegacoes: {},
    }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.equal(r.tarefas.length, 1);
    assert.ok(r.rejeitadas.every((x) => x.motivo === 'delegacao_nao_permitida'));
  });

  it('`aprovarDelegacao` pode vetar; erro no gancho também veta; recebe cópias', async () => {
    const vistos = [];
    const veta = async (proposta, pai) => { vistos.push([proposta.titulo, pai.papel]); proposta.titulo = 'adulterado'; return proposta.papel === 'testes'; };
    const r = await criarOrquestrador({ agentes: { manager: plano(filhas), testes: faz(), devops: faz() }, avaliadores: [aprova()], aprovarDelegacao: veta }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.deepEqual(r.tarefas.map((t) => t.titulo), ['Plano', 'Escrever os testes']);
    assert.deepEqual(r.rejeitadas.map((x) => x.motivo), ['delegacao_nao_aprovada']);
    assert.deepEqual(vistos, [['Escrever os testes', 'manager'], ['Mexer na infraestrutura', 'manager']]);
    const r2 = await criarOrquestrador({ agentes: { manager: plano(filhas), testes: faz(), devops: faz() }, avaliadores: [aprova()], aprovarDelegacao: () => { throw new Error('caiu'); } }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.equal(r2.tarefas.length, 1);
  });

  it('a tarefa inicial (do dono) não passa pelas regras de delegação', async () => {
    const r = await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [aprova()], delegacoes: {}, aprovarDelegacao: () => false }).executar(tarefa());
    assert.equal(r.tarefas[0].estado, 'aprovada');
  });

  it('roteador que falha ou devolve lixo rejeita a proposta sem derrubar a execução', async () => {
    const sem = [{ titulo: 'Sem papel definido', criterios: ['feito'] }];
    const quebra = await criarOrquestrador({ agentes: { manager: plano(sem), testes: faz() }, avaliadores: [aprova()], roteador: () => { throw new Error('bug'); } }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.equal(quebra.rejeitadas[0].motivo, 'roteador_falhou');
    const lixo = await criarOrquestrador({ agentes: { manager: plano(sem), testes: faz() }, avaliadores: [aprova()], roteador: () => ({ papel: 'testes' }) }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.equal(lixo.rejeitadas[0].motivo, 'papel_desconhecido');
    const proto = await criarOrquestrador({ agentes: { manager: plano(sem), testes: faz() }, avaliadores: [aprova()], roteador: () => 'constructor' }).executar(tarefa({ papel: 'manager', titulo: 'Plano' }));
    assert.equal(proto.rejeitadas[0].motivo, 'papel_desconhecido');
  });
});

describe('roteadorPorPalavrasChave', () => {
  it('casa palavras inteiras e frases, não pedaços de palavras', () => {
    const rota = roteadorPorPalavrasChave({ backend: ['api', 'banco de dados'], docs: ['readme'] }, 'geral');
    assert.equal(rota({ titulo: 'Capital de giro' }), 'geral', '"api" dentro de "capital" não conta');
    assert.equal(rota({ titulo: 'Revisar a API' }), 'backend');
    assert.equal(rota({ titulo: 'Modelar o banco de dados' }), 'backend');
    assert.equal(rota({ titulo: 'Atualizar README.md' }), 'docs');
    assert.equal(rota({ titulo: 'Preparar o readmes' }), 'geral');
  });

  it('o papel com mais acertos vence; empate fica com o primeiro; mapa ruim é recusado', () => {
    const rota = roteadorPorPalavrasChave({ a: ['x'], b: ['x', 'y'], c: ['y', 'x'] }, 'padrao');
    assert.equal(rota({ titulo: 'x y' }), 'b');
    assert.throws(() => roteadorPorPalavrasChave({ a: 'x' }, 'p'), /mapa deve ser/);
    assert.throws(() => roteadorPorPalavrasChave(null, 'p'), /mapa deve ser/);
  });
});

describe('texto da tarefa: controles, segredos e entrada', () => {
  it('título, descrição e critérios com controles, bidi ou escape ANSI são rejeitados', async () => {
    const orq = () => criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [aprova()] });
    for (const extra of [{ titulo: `Criar ${ESC}[2J o endpoint` }, { descricao: `oi ${BIDI} tchau` }, { criterios: [`passa${ESC}[1m`] }]) {
      await assert.rejects(orq().executar(tarefa(extra)), /controle_na_tarefa/);
    }
  });

  it('a entrada do dono é validada, neutralizada, sem segredo e herdada pelas filhas', async () => {
    const orq = (agentes) => criarOrquestrador({ agentes, avaliadores: [aprova()] });
    await assert.rejects(orq({ backend: faz() }).executar(tarefa({ entrada: 42 })), /entrada_invalida/);
    await assert.rejects(orq({ backend: faz() }).executar(tarefa({ entrada: '' })), /entrada_invalida/);
    await assert.rejects(orq({ backend: faz() }).executar(tarefa({ entrada: 'x'.repeat(60_001) })), /entrada_invalida/);
    await assert.rejects(orq({ backend: faz() }).executar(tarefa({ entrada: `const k = "${SK}";` })), /segredo_na_tarefa/);

    const vistas = [];
    const agentes = {
      manager: async (t) => { vistas.push(['manager', t.entrada]); return { resultado: 'plano', novas_tarefas: [{ titulo: 'Implementar a mudança', papel: 'backend', criterios: ['feito'] }] }; },
      backend: async (t) => { vistas.push(['backend', t.entrada]); return { resultado: 'ok' }; },
    };
    const entrada = `diff --git a/x b/x\n+linha${ESC}[2J nova\r\n+outra`;
    const r = await orq(agentes).executar(tarefa({ papel: 'manager', titulo: 'Plano', entrada }));
    assert.equal(vistas[0][1], vistas[1][1], 'a filha herda a entrada');
    assert.ok(!vistas[0][1].includes(ESC) && vistas[0][1].includes('\\u{1b}') && !vistas[0][1].includes('\r'));
    assert.ok(vistas[0][1].startsWith('diff --git'));
    assert.equal(r.tarefas[1].entrada, vistas[0][1]);
  });

  it('o avaliador também recebe a entrada', async () => {
    let vista;
    await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [{ nome: 'qa', avaliar: async (t) => { vista = t.entrada; return { aprovado: true }; } }] }).executar(tarefa({ entrada: 'o código a revisar' }));
    assert.equal(vista, 'o código a revisar');
  });
});

describe('segredos nas entregas, no feedback e na auditoria', () => {
  it('entrega com credencial reprova a tentativa: o avaliador nunca a vê e ela não vai ao relatório', async () => {
    let avaliou = 0;
    let n = 0;
    const agente = async () => { n += 1; return { resultado: n === 1 ? `use a chave ${SK} no deploy` : 'sem segredo agora' }; };
    const { l, auditoria } = eventosDe();
    const r = await criarOrquestrador({ agentes: { backend: agente }, avaliadores: [{ nome: 'qa', avaliar: async () => { avaliou += 1; return { aprovado: true }; } }], auditoria }).executar(tarefa());
    assert.equal(avaliou, 1, 'só a entrega limpa foi avaliada');
    assert.equal(r.tarefas[0].tentativas, 2);
    assert.match(r.tarefas[0].feedback[0], /credencial/);
    assert.ok(!JSON.stringify([r, l]).includes('Rr6s'));
    assert.ok(l.some((e) => e.evento === 'entrega_com_segredo'));
  });

  it('segredo no erro do executor, no feedback do avaliador e na auditoria é mascarado (e o executor recebe o feedback já limpo)', async () => {
    let n = 0;
    let feedbackRecebido;
    const agente = async (_t, ctx) => { n += 1; feedbackRecebido = ctx.feedback; if (n === 1) throw new Error(`falhou com ${SK}`); return { resultado: 'ok' }; };
    const qa = { nome: 'qa', avaliar: async () => ({ aprovado: true, feedback: `ok, mas vi ${SK}` }) };
    const { l, auditoria } = eventosDe();
    const r = await criarOrquestrador({ agentes: { backend: agente }, avaliadores: [qa], auditoria }).executar(tarefa());
    assert.ok(!JSON.stringify([r, l, feedbackRecebido]).includes('Rr6s'));
    assert.match(feedbackRecebido[0], /\*\*\*/);
  });

  it('feedback com escape ANSI chega ao executor e ao humano já neutralizado', async () => {
    const vistos = [];
    const qa = { nome: 'qa', avaliar: async () => ({ aprovado: false, feedback: `corrija ${ESC}[2J${BIDI}isto` }) };
    await criarOrquestrador({
      agentes: { backend: async (_t, ctx) => { vistos.push(ctx.feedback.join('|')); return { resultado: 'x' }; } }, avaliadores: [qa], orcamento: { maxTentativas: 2 },
      humano: async (info) => { vistos.push(info.feedback.join('|')); return { acao: 'rejeitar' }; },
    }).executar(tarefa());
    assert.ok(vistos.length === 3 && vistos.every((v) => !v.includes(ESC) && !v.includes(BIDI)));
  });

  it('a informação entregue ao humano vem mascarada e neutralizada, com um resumo das propostas', async () => {
    let info;
    const entrega = { resultado: `resultado ${ESC}[31m`, novas_tarefas: [{ titulo: 'Documentar tudo', papel: 'backend', criterios: ['ok ok'] }], licoes: [{ tipo: 'nota', chave: 'nota.x', valor: 'algo útil' }] };
    await criarOrquestrador({ agentes: { backend: async () => entrega }, avaliadores: [reprova()], orcamento: { maxTentativas: 1 }, humano: async (i) => { info = i; return { acao: 'rejeitar' }; } }).executar(tarefa());
    assert.ok(!info.entrega.includes(ESC));
    assert.deepEqual(info.propostas, { novas_tarefas: ['Documentar tudo'], licoes: ['nota.x'] });
  });
});

describe('falhas das funções injetadas não derrubam a execução', () => {
  it('humano que lança erro ou rejeita deixa a tarefa escalada', async () => {
    for (const humano of [async () => { throw new Error('caiu'); }, () => { throw new Error('caiu'); }, async () => null, async () => 'aprovar']) {
      const r = await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [reprova()], orcamento: { maxTentativas: 1 }, humano }).executar(tarefa());
      assert.equal(r.tarefas[0].estado, 'escalada');
    }
  });

  it('auditoria que lança (síncrona ou assíncrona) não impede a execução; as falhas são contadas', async () => {
    const naoTratados = [];
    const ouvinte = (e) => naoTratados.push(e);
    process.on('unhandledRejection', ouvinte);
    try {
      for (const auditoria of [() => { throw new Error('disco cheio'); }, async () => { throw new Error('rede'); }]) {
        const orq = criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [aprova()], auditoria });
        const r = await orq.executar(tarefa());
        assert.equal(r.tarefas[0].estado, 'aprovada');
        await new Promise((ok) => setTimeout(ok, 10));
        assert.ok(orq.falhasDeAuditoria() >= 5);
      }
    } finally { process.off('unhandledRejection', ouvinte); }
    assert.deepEqual(naoTratados, []);
  });

  it('o agente devolve lixo (null, texto, número, lista, objeto vazio): tentativa falha, sem exceção', async () => {
    for (const lixo of [null, 'texto', 42, [], {}, { resultado: 5 }, { resultado: 'x'.repeat(20_001) }]) {
      const r = await criarOrquestrador({ agentes: { backend: async () => lixo }, avaliadores: [aprova()], orcamento: { maxTentativas: 1 } }).executar(tarefa());
      assert.equal(r.tarefas[0].estado, 'escalada', JSON.stringify(lixo)?.slice(0, 30));
    }
  });

  it('agente que lança de forma síncrona, ou lança texto/null, conta como tentativa falha', async () => {
    for (const lancar of [() => { throw new Error('sync'); }, () => { throw 'texto'; }, () => { throw null; }]) {
      const r = await criarOrquestrador({ agentes: { backend: lancar }, avaliadores: [aprova()], orcamento: { maxTentativas: 1 } }).executar(tarefa());
      assert.equal(r.tarefas[0].estado, 'escalada');
    }
  });

  it('avaliador que devolve lixo, é incoerente ou lança reprova (nunca aprova)', async () => {
    const lixos = [null, 'sim', { aprovado: 'true' }, { aprovado: 1 }, { aprovado: false }, { aprovado: false, feedback: 'x' },
      { aprovado: true, criterios: [{ criterio: 'a', atendido: true }, { criterio: 'b', atendido: false }] }, { aprovado: true, criterios: [{ criterio: 'a' }] }];
    for (const lixo of lixos) {
      const r = await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [{ nome: 'qa', avaliar: async () => lixo }], orcamento: { maxTentativas: 1 } }).executar(tarefa());
      assert.equal(r.tarefas[0].estado, 'escalada', JSON.stringify(lixo));
    }
    const ok = await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [{ nome: 'qa', avaliar: async () => ({ aprovado: true, criterios: [{ criterio: 'a', atendido: true }] }) }] }).executar(tarefa());
    assert.equal(ok.tarefas[0].estado, 'aprovada');
  });

  it('nota fora de 0..1 ou inválida é ajustada/ignorada', async () => {
    const nota = async (n) => (await criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [{ nome: 'qa', avaliar: async () => ({ aprovado: true, nota: n }) }] }).executar(tarefa())).tarefas[0].avaliacoes[0].nota;
    assert.equal(await nota(7), 1);
    assert.equal(await nota(-3), 0);
    assert.equal(await nota(NaN), undefined);
    assert.equal(await nota('0.5'), undefined);
  });

  it('executar ao mesmo tempo no mesmo orquestrador é recusado; depois que termina, pode rodar de novo', async () => {
    const orq = criarOrquestrador({ agentes: { backend: async () => { await new Promise((ok) => setTimeout(ok, 20)); return { resultado: 'x' }; } }, avaliadores: [aprova()] });
    const primeira = orq.executar(tarefa());
    await assert.rejects(orq.executar(tarefa()), /já está executando/);
    assert.equal((await primeira).tarefas[0].estado, 'aprovada');
    assert.equal((await orq.executar(tarefa())).tarefas[0].estado, 'aprovada');
  });

  it('mesmo que a tarefa inicial seja rejeitada, o orquestrador fica livre para a próxima execução', async () => {
    const orq = criarOrquestrador({ agentes: { backend: faz() }, avaliadores: [aprova()] });
    await assert.rejects(orq.executar(tarefa({ criterios: [] })), /criterios_invalidos/);
    assert.equal((await orq.executar(tarefa())).tarefas[0].estado, 'aprovada');
  });
});

describe('a entrega é uma cópia e a de uma tentativa anterior nunca é aprovada', () => {
  it('o agente não consegue alterar a entrega depois de devolvê-la', async () => {
    let guardada;
    const agente = async () => { guardada = { resultado: 'original', novas_tarefas: [] }; setTimeout(() => { guardada.resultado = 'adulterado'; }, 0); return guardada; };
    const r = await criarOrquestrador({ agentes: { backend: agente }, avaliadores: [aprova()] }).executar(tarefa());
    await new Promise((ok) => setTimeout(ok, 10));
    assert.equal(r.tarefas[0].entrega.resultado, 'original');
  });

  it('se a última tentativa falha na execução, o humano não pode aprovar a entrega velha', async () => {
    let n = 0;
    let info;
    const agente = async () => { n += 1; if (n === 2) throw new Error('quebrou na segunda'); return { resultado: 'entrega da primeira' }; };
    const r = await criarOrquestrador({
      agentes: { backend: agente }, avaliadores: [reprova()], orcamento: { maxTentativas: 2 },
      humano: async (i) => { info = i; return { acao: 'aprovar' }; },
    }).executar(tarefa());
    assert.equal(info.entrega, null);
    assert.equal(r.tarefas[0].estado, 'escalada');
    assert.equal(r.tarefas[0].aprovada_por, undefined);
  });

  it('campos desconhecidos da entrega são descartados (ela não carrega estado para o orquestrador)', async () => {
    const r = await criarOrquestrador({ agentes: { backend: faz('ok', { estado: 'aprovada', aprovada_por: 'eu', outro: 1 }) }, avaliadores: [reprova()], orcamento: { maxTentativas: 1 } }).executar(tarefa());
    assert.deepEqual(Object.keys(r.tarefas[0].entrega), ['resultado']);
    assert.equal(r.tarefas[0].estado, 'escalada');
  });

  it('evidências da entrega chegam ao avaliador (limitadas) e propostas não serializáveis são ignoradas, sem derrubar', async () => {
    let vista;
    const evidencias = Array.from({ length: 80 }, (_, i) => ({ ferramenta: 'rodar_testes', ok: true, resumo: `rodada ${i}` }));
    const qa = { nome: 'qa', avaliar: async (_t, e) => { vista = e; return { aprovado: true }; } };
    const r = await criarOrquestrador({ agentes: { backend: faz('ok', { evidencias, novas_tarefas: [{ titulo: 'Inválida', papel: 'backend', criterios: ['x'], f: () => 1 }] }) }, avaliadores: [qa] }).executar(tarefa());
    assert.equal(vista.evidencias.length, 50);
    assert.equal(r.tarefas[0].estado, 'aprovada');
    assert.equal(r.tarefas.length, 1);
  });
});

describe('lições: controles, duplicatas, limite e gravação', () => {
  const comMemoria = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-'));
    tmps.push(d);
    return criarMemoria({ arquivo: path.join(d, 'm.jsonl'), escoposPermitidos: ['global', 'proj-a'] });
  };
  const l = (chave, extra = {}) => ({ tipo: 'padrao', chave, valor: `valor da lição ${chave}`, escopo: 'projeto', ...extra });

  it('motivoDaLicao: formato, controle e segredo', () => {
    assert.equal(motivoDaLicao(l('padrao.ok')), null);
    assert.equal(motivoDaLicao(null), 'formato');
    assert.equal(motivoDaLicao(l('Maiúscula')), 'formato');
    assert.equal(motivoDaLicao(l('padrao.ok', { tipo: 'credencial' })), 'formato');
    assert.equal(motivoDaLicao(l('padrao.ok', { escopo: 'mundo' })), 'formato');
    assert.equal(motivoDaLicao(l('padrao.ok', { valor: `ok ${ESC}[2J` })), 'controle');
    assert.equal(motivoDaLicao(l('padrao.ok', { valor: `use ${SK}` })), 'segredo');
  });

  it('lição com controle, duplicada (mesma chave e escopo) ou acima do limite não entra; a mesma chave em outro escopo entra', async () => {
    const licoes = [l('a.um'), l('a.um'), l('a.dois', { valor: `oi ${ESC}[1m` }), l('a.um', { escopo: 'global' }), l('a.tres'), l('a.quatro')];
    const r = await criarOrquestrador({ agentes: { backend: faz('ok', { licoes }) }, avaliadores: [aprova()], orcamento: { maxLicoes: 3 }, memoria: comMemoria(), escopoProjeto: 'proj-a' }).executar(tarefa());
    assert.deepEqual(r.licoes.map((x) => [x.chave, x.escopo]), [['a.um', 'projeto'], ['a.um', 'global'], ['a.tres', 'projeto']]);
  });

  it('só 5 lições por entrega são consideradas', async () => {
    const licoes = Array.from({ length: 9 }, (_, i) => l(`nota.n${i}`));
    const r = await criarOrquestrador({ agentes: { backend: faz('ok', { licoes }) }, avaliadores: [aprova()] }).executar(tarefa());
    assert.equal(r.licoes.length, 5);
  });

  it('aprovarLicao devolve cópia e a gravação passa pela validação do formato mesmo em lição adulterada', async () => {
    const memoria = comMemoria();
    const orq = criarOrquestrador({ agentes: { backend: faz('ok', { licoes: [l('padrao.erros', { escopo: 'global' })] }) }, avaliadores: [aprova()], memoria, escopoProjeto: 'proj-a' });
    await orq.executar(tarefa());
    const aprovada = orq.aprovarLicao('l1');
    aprovada.valor = 'adulterado depois';
    assert.equal(orq.licoes()[0].valor, 'valor da lição padrao.erros');
    assert.throws(() => gravarLicao(memoria, { id: 'x', tipo: 'padrao', chave: 'Inválida!', valor: 'xxxxx' }, { escopoProjeto: 'proj-a' }), /inválida \(formato\)/);
    assert.throws(() => gravarLicao(memoria, { id: 'x', tipo: 'padrao', chave: 'ok.chave', valor: `chave ${SK}` }, { escopoProjeto: 'proj-a' }), /inválida \(segredo\)/);
    assert.equal(gravarLicao(memoria, { id: 'x', tipo: 'nota', chave: 'ok.chave', valor: 'tudo certo aqui', origem: 'manual' }, { escopoProjeto: 'proj-a' }).substituiu, false);
    assert.equal(memoria.buscar({ escopo: 'proj-a' }).itens[0].fonte, 'time:manual');
  });

  it('erro da memória ao aprovar mantém a lição pendente', async () => {
    const memoria = comMemoria();
    const orq = criarOrquestrador({ agentes: { backend: faz('ok', { licoes: [l('padrao.erros')] }) }, avaliadores: [aprova()], memoria, escopoProjeto: 'escopo-nao-liberado' });
    await orq.executar(tarefa());
    assert.throws(() => orq.aprovarLicao('l1'), /não está liberado/);
    assert.equal(orq.licoes()[0].estado, 'pendente');
  });
});

describe('configuração', () => {
  it('recusa configurações erradas com mensagem clara', () => {
    const base = { agentes: { backend: faz() } };
    assert.throws(() => criarOrquestrador({ agentes: { Backend: faz() } }), /nome de papel inválido/);
    assert.throws(() => criarOrquestrador({ agentes: [faz()] }), /ao menos um papel/);
    assert.throws(() => criarOrquestrador({ ...base, avaliadores: 'qa' }), /avaliadores deve ser uma lista/);
    assert.throws(() => criarOrquestrador({ ...base, avaliadores: [{ nome: 'x', avaliar: () => {}, aplicaA: 'sempre' }] }), /aplicaA/);
    assert.throws(() => criarOrquestrador({ ...base, roteador: 'x' }), /roteador deve ser uma função/);
    assert.throws(() => criarOrquestrador({ ...base, humano: 1 }), /humano deve ser uma função/);
    assert.throws(() => criarOrquestrador({ ...base, aprovarDelegacao: 1 }), /aprovarDelegacao deve ser uma função/);
    assert.throws(() => criarOrquestrador({ ...base, auditoria: 1 }), /auditoria deve ser uma função/);
    assert.throws(() => criarOrquestrador({ ...base, memoria: {}, escopoProjeto: 'p' }), /salvar\(\) e buscar\(\)/);
    assert.throws(() => criarOrquestrador({ ...base, delegacoes: { manager: 'testes' } }), /delegacoes deve ser/);
  });
});
