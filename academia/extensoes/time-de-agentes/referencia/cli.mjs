// Linha de comando do time de agentes: delega UMA tarefa ao time, mostra o que aconteceu e propõe aprendizados.
//
//   node cli.mjs --config time.config.json --projeto meu-projeto \
//     --criterio "o endpoint responde 400 para entrada inválida" --criterio "há testes passando" \
//     "Criar o endpoint de cadastro de clientes"
//
// Variáveis do modelo: OPENAI_BASE_URL, OPENAI_API_KEY, MODELO_CHAT (as mesmas do resto do repositório).
// Cada execução grava um relatório JSON (tarefas, avaliações, auditoria) em --saida; segredos são mascarados.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { ehPrincipal, mascararSegredos } from '../../../ferramentas/comum.mjs';
import { criarMemoria } from '../../memoria-persistente-mcp/referencia/memoria.mjs';
import { criarAgenteDeLLM, criarAvaliadorDeLLM, criarClienteHttp } from './agente-llm.mjs';
import { criarOrquestrador, roteadorPorPalavrasChave } from './orquestrador.mjs';

const USO = `Uso: node cli.mjs --projeto <slug> --criterio "<critério>" [--criterio "..."] [opções] "<título da tarefa>"

  --projeto <slug>            escopo da memória deste projeto (obrigatório)
  --criterio "<texto>"        critério de aceitação verificável (repita; pelo menos 1)
  --descricao "<texto>"       detalhes da tarefa
  --papel <papel>             papel que executa (senão o roteador do config decide)
  --config <arquivo>          padrão: ./time.config.json
  --saida <pasta>             relatórios de execução (padrão: ./execucoes)
  --aprovar-licoes <modo>     perguntar | nenhuma | projeto | todas  (padrão: perguntar no terminal, senão nenhuma)
                              "todas" grava até lições de escopo global sem perguntar: use com cuidado`;

function lerArgs(args) {
  const o = { criterios: [] };
  const pos = [];
  const comValor = ['--projeto', '--criterio', '--descricao', '--papel', '--config', '--saida', '--aprovar-licoes'];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    if (!comValor.includes(a)) throw new Error(`opção desconhecida: ${a}`);
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`a opção ${a} precisa de um valor`);
    i += 1;
    if (a === '--criterio') o.criterios.push(v); else o[a.slice(2)] = v;
  }
  if (pos.length !== 1) throw new Error('informe o título da tarefa (um único argumento entre aspas)');
  if (!o.projeto) throw new Error('--projeto é obrigatório');
  if (!o.criterios.length) throw new Error('informe pelo menos um --criterio (sem critério de aceitação não há como avaliar)');
  const modo = o['aprovar-licoes'];
  if (modo && !['perguntar', 'nenhuma', 'projeto', 'todas'].includes(modo)) throw new Error('--aprovar-licoes deve ser perguntar, nenhuma, projeto ou todas');
  return { ...o, titulo: pos[0] };
}

function carregarConfig(arquivo) {
  const base = path.dirname(path.resolve(arquivo));
  const cfg = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const perfil = cfg.perfil ? fs.readFileSync(path.resolve(base, cfg.perfil), 'utf8').trim() : '';
  // O perfil do dono (como ele avalia e resolve problemas) vai no prompt de TODOS os agentes e avaliadores.
  const blocoPerfil = perfil ? `\n\n## Perfil do dono (siga ao avaliar e ao resolver problemas)\n${perfil}` : '';
  const persona = (rel) => fs.readFileSync(path.resolve(base, rel), 'utf8').trim() + blocoPerfil;
  if (!cfg.agentes || !Object.keys(cfg.agentes).length) throw new Error('config: defina "agentes" ({ papel: caminho-da-persona })');
  return {
    cfg, base,
    personas: Object.fromEntries(Object.entries(cfg.agentes).map(([papel, rel]) => [papel, persona(rel)])),
    avaliadoresCfg: (cfg.avaliadores ?? []).map((a) => ({ ...a, texto: persona(a.persona) })),
  };
}

export async function main(argv, { env = process.env, saida = console.log, erro = console.error, stdin = process.stdin, cwd = process.cwd() } = {}) {
  let a;
  try { a = lerArgs(argv); } catch (e) { erro(`erro: ${e.message}\n\n${USO}`); return 2; }
  const arquivoConfig = path.resolve(cwd, a.config ?? 'time.config.json');
  let carregado;
  try { carregado = carregarConfig(arquivoConfig); } catch (e) { erro(`erro ao ler a configuração (${arquivoConfig}): ${e.message}`); return 2; }
  const { cfg, base, personas, avaliadoresCfg } = carregado;

  const chamarModelo = criarClienteHttp({ env });
  const papeis = Object.keys(personas);
  const agentes = Object.fromEntries(papeis.map((p) => [p, criarAgenteDeLLM({ persona: personas[p], chamarModelo, papeis })]));
  const avaliadores = avaliadoresCfg.map((av) => criarAvaliadorDeLLM({
    nome: av.nome, persona: av.texto, chamarModelo, limiar: av.limiar ?? 0.8,
    aplicaA: av.aplicaA ? (t) => av.aplicaA.includes(t.papel) : undefined,
  }));
  const escopoGlobal = cfg.memoria?.escopoGlobal ?? 'global';
  const memoria = criarMemoria({ arquivo: path.resolve(base, cfg.memoria?.arquivo ?? './memoria-do-time.jsonl'), escoposPermitidos: [escopoGlobal, a.projeto] });
  const eventos = [];
  const orq = criarOrquestrador({
    agentes, avaliadores, memoria, escopoProjeto: a.projeto, escopoGlobal, orcamento: cfg.orcamento,
    roteador: cfg.roteador ? roteadorPorPalavrasChave(cfg.roteador.palavras ?? {}, cfg.roteador.padrao ?? papeis[0]) : undefined,
    auditoria: (e) => eventos.push(e),
  });

  saida(`Delegando ao time (projeto ${a.projeto}): ${a.titulo}`);
  let r;
  try {
    // sem --papel e sem roteador no config: o "manager" (que decompõe) ou, na falta dele, o primeiro papel configurado
    const papelRaiz = a.papel ?? (cfg.roteador ? undefined : (papeis.includes('manager') ? 'manager' : papeis[0]));
    r = await orq.executar({ titulo: a.titulo, descricao: a.descricao, criterios: a.criterios, papel: papelRaiz });
  } catch (e) { erro(`erro: ${e.message}`); return 1; }

  saida(`\nResultado: ${r.parada} · ${r.chamadas} chamadas · ${Object.entries(r.porEstado).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  for (const t of r.tarefas) {
    const nota = t.avaliacoes.filter((x) => x.nota !== undefined).at(-1)?.nota;
    saida(`  ${t.id} [${t.estado}] ${t.papel}: ${t.titulo}${t.pai ? ` (filha de ${t.pai})` : ''} · ${t.tentativas} tentativa(s)${nota !== undefined ? ` · nota ${nota}` : ''}${t.motivo ? ` · ${t.motivo}` : ''}`);
  }
  for (const rj of r.rejeitadas) saida(`  proposta rejeitada: "${rj.proposta.titulo}" (${rj.motivo})`);

  // Aprendizados: nada vai para a memória sem aprovação.
  let modo = a['aprovar-licoes'] ?? (stdin.isTTY ? 'perguntar' : 'nenhuma');
  const gravadas = [];
  if (r.licoes.length) saida(`\nAprendizados propostos (${r.licoes.length}):`);
  let leitor;
  for (const l of r.licoes) {
    saida(`  ${l.id} [${l.escopo}] ${l.tipo}/${l.chave}: ${l.valor}`);
    let ok = modo === 'todas' || (modo === 'projeto' && l.escopo === 'projeto');
    if (modo === 'perguntar') {
      leitor ??= readline.createInterface({ input: stdin, output: process.stdout });
      ok = /^s(im)?$/i.test((await leitor.question(`    guardar na memória (${l.escopo})? [s/N] `)).trim());
    }
    try {
      if (ok) { orq.aprovarLicao(l.id); gravadas.push(l.id); } else orq.rejeitarLicao(l.id);
    } catch (e) { erro(`    não foi possível gravar ${l.id}: ${e.message}`); }
  }
  leitor?.close();
  if (r.licoes.length) saida(`  gravadas: ${gravadas.length ? gravadas.join(', ') : 'nenhuma'}`);

  const pasta = path.resolve(cwd, a.saida ?? 'execucoes');
  fs.mkdirSync(pasta, { recursive: true });
  const nome = `${new Date().toISOString().replace(/[:.]/g, '-')}-${a.projeto}.json`;
  const relatorio = { projeto: a.projeto, modelo: chamarModelo.info, parada: r.parada, chamadas: r.chamadas, porEstado: r.porEstado, tarefas: r.tarefas, licoes: orq.licoes(), rejeitadas: r.rejeitadas, auditoria: eventos };
  fs.writeFileSync(path.join(pasta, nome), mascararSegredos(JSON.stringify(relatorio, null, 2)));
  saida(`\nRelatório: ${path.join(pasta, nome)}`);
  return r.tarefas.every((t) => t.estado === 'aprovada') ? 0 : 1;
}

if (ehPrincipal(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
