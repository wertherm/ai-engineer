// Linha de comando do time de agentes: delega UMA tarefa ao time, mostra o que aconteceu e propõe aprendizados.
//
//   node cli.mjs --config time.config.json --projeto meu-projeto --raiz ../meu-projeto \
//     --criterio "o endpoint responde 400 para entrada inválida" --criterio "os testes passam" \
//     "Criar o endpoint de cadastro de clientes"
//
//   node cli.mjs licoes listar | aprovar <id> | rejeitar <id>      (aprendizados que ficaram pendentes)
//
// Variáveis do modelo: OPENAI_BASE_URL, OPENAI_API_KEY, MODELO_CHAT (as mesmas do resto do repositório).
// Cada execução grava um relatório JSON (tarefas, avaliações, auditoria) em --saida; segredos são mascarados.
//
// O que sai da sua máquina: o título, os critérios, a entrada (--entrada) e o que os agentes lerem em --raiz vão para o endpoint do modelo.
// Se o endpoint não for local, a CLI exige --confirmo-envio-externo quando houver --entrada ou --raiz.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { acharSegredos, ehPrincipal, mascararProfundo, neutralizarControles, paraTerminal } from '../../../ferramentas/comum.mjs';
import { criarRegistro } from '../../harness-de-agentes/referencia/registro-de-ferramentas.mjs';
import { criarMemoria } from '../../memoria-persistente-mcp/referencia/memoria.mjs';
import { criarAgenteDeLLM, criarAvaliadorDeLLM, criarClienteHttp } from './agente-llm.mjs';
import { criarFerramentasDoProjeto } from './ferramentas-do-projeto.mjs';
import { criarOrquestrador, gravarLicao, LIMITES, motivoDaLicao, roteadorPorPalavrasChave } from './orquestrador.mjs';

const USO = `Uso: node cli.mjs --projeto <slug> --criterio "<critério>" [--criterio "..."] [opções] "<título da tarefa>"
     node cli.mjs licoes listar|aprovar <id>|rejeitar <id> [--config <arquivo>]

  --projeto <slug>            escopo da memória deste projeto (obrigatório; a-z, 0-9, _ . -)
  --criterio "<texto>"        critério de aceitação verificável (repita; pelo menos 1)
  --descricao "<texto>"       detalhes da tarefa
  --papel <papel>             papel que executa (senão o roteador do config decide)
  --entrada <arquivo>         texto que o time deve analisar (um diff, um trecho de código, um relatório); até ${LIMITES.entrada} caracteres
  --raiz <pasta>              pasta do projeto: dá aos agentes ferramentas de leitura, git diff e (se o config liberar) rodar testes
  --confirmo-envio-externo    obrigatório para enviar --entrada/--raiz a um modelo que NÃO esteja na sua máquina
  --config <arquivo>          padrão: ./time.config.json
  --saida <pasta>             relatórios de execução (padrão: ./execucoes)
  --aprovar-licoes <modo>     perguntar | nenhuma | projeto | todas  (padrão: perguntar no terminal, senão nenhuma)
                              o que não for aprovado fica PENDENTE (veja "licoes listar"); "todas" grava até escopo global: use com cuidado`;

const ESCOPO = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const ID_LICAO = /^lp-[a-z0-9]{4,24}-l\d{1,3}$/;
const COM_VALOR = ['--projeto', '--criterio', '--descricao', '--papel', '--config', '--saida', '--aprovar-licoes', '--raiz', '--entrada'];
const SEM_VALOR = ['--confirmo-envio-externo'];
const ext = (arq) => path.extname(arq).toLowerCase();
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function lerArgs(args) {
  const o = { criterios: [] };
  const pos = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    if (SEM_VALOR.includes(a)) { o[a.slice(2)] = true; continue; }
    if (!COM_VALOR.includes(a)) throw new Error(`opção desconhecida: ${paraTerminal(a).slice(0, 40)}`);
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`a opção ${a} precisa de um valor`);
    i += 1;
    if (a === '--criterio') o.criterios.push(v); else o[a.slice(2)] = v;
  }
  if (pos.length !== 1) throw new Error('informe o título da tarefa (um único argumento entre aspas)');
  if (!o.projeto) throw new Error('--projeto é obrigatório');
  if (!ESCOPO.test(o.projeto)) throw new Error('--projeto deve usar só a-z, 0-9, _ . - (até 64 caracteres, começando por letra ou número)');
  if (!o.criterios.length) throw new Error('informe pelo menos um --criterio (sem critério de aceitação não há como avaliar)');
  const modo = o['aprovar-licoes'];
  if (modo && !['perguntar', 'nenhuma', 'projeto', 'todas'].includes(modo)) throw new Error('--aprovar-licoes deve ser perguntar, nenhuma, projeto ou todas');
  return { ...o, titulo: pos[0] };
}

/** Lê um texto de configuração (persona, perfil). Só .md/.txt, tamanho limitado, sem segredos: um config não pode ser usado para enviar arquivos sensíveis ao modelo. */
function lerTextoDeConfig(base, rel, rotulo) {
  if (typeof rel !== 'string' || !rel) throw new Error(`${rotulo}: informe o caminho do arquivo`);
  const abs = path.resolve(base, rel);
  if (!['.md', '.txt', '.markdown'].includes(ext(abs))) throw new Error(`${rotulo}: só arquivos .md ou .txt (recebi "${paraTerminal(path.basename(abs)).slice(0, 60)}")`);
  let texto;
  try {
    if (fs.statSync(abs).size > 200_000) throw new Error('grande demais (200 KB)');
    texto = fs.readFileSync(abs, 'utf8');
  } catch (e) { throw new Error(`${rotulo}: não consegui ler ${rel} (${e.code ?? e.message})`); }
  if (acharSegredos(texto).length) throw new Error(`${rotulo}: ${rel} parece conter uma credencial; remova antes de usar`);
  return texto.trim();
}

function carregarConfig(arquivo) {
  const base = path.dirname(path.resolve(arquivo));
  const cfg = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  if (!ehObjeto(cfg)) throw new Error('o config deve ser um objeto JSON');
  if (!ehObjeto(cfg.agentes) || !Object.keys(cfg.agentes).length) throw new Error('config: defina "agentes" ({ papel: caminho-da-persona })');
  if (cfg.avaliadores !== undefined && !Array.isArray(cfg.avaliadores)) throw new Error('config: "avaliadores" deve ser uma lista');
  const perfil = cfg.perfil ? lerTextoDeConfig(base, cfg.perfil, 'perfil') : '';
  // O perfil do dono (como ele avalia e resolve problemas) vai no prompt de TODOS os agentes e avaliadores.
  const blocoPerfil = perfil ? `\n\n## Perfil do dono (siga ao avaliar e ao resolver problemas)\n${perfil}` : '';
  const persona = (rel, rotulo) => lerTextoDeConfig(base, rel, rotulo) + blocoPerfil;
  const agentesCfg = Object.fromEntries(Object.entries(cfg.agentes).map(([papel, v]) => {
    const def = typeof v === 'string' ? { persona: v } : v;
    if (!ehObjeto(def)) throw new Error(`config: agentes.${papel} deve ser um caminho ou { persona, modelo?, maxPassos? }`);
    return [papel, { ...def, texto: persona(def.persona, `agentes.${papel}`) }];
  }));
  const avaliadoresCfg = (cfg.avaliadores ?? []).map((a, i) => {
    if (!ehObjeto(a) || typeof a.nome !== 'string' || !a.nome) throw new Error(`config: avaliadores[${i}] precisa de nome e persona`);
    return { ...a, texto: persona(a.persona, `avaliadores.${a.nome}`) };
  });
  return { cfg, base, agentesCfg, avaliadoresCfg };
}

/** Confere a configuração ANTES de gastar qualquer chamada ao modelo. Devolve uma lista de problemas. */
function conferirConfig({ cfg, agentesCfg, avaliadoresCfg }) {
  const p = [];
  const papeis = Object.keys(agentesCfg);
  for (const a of avaliadoresCfg) for (const papel of a.aplicaA ?? []) if (!papeis.includes(papel)) p.push(`avaliador "${a.nome}": aplicaA aponta o papel inexistente "${papel}"`);
  if (cfg.aprovarSemAvaliador !== true) {
    for (const papel of papeis) {
      if (!avaliadoresCfg.some((a) => !a.aplicaA || a.aplicaA.includes(papel))) {
        p.push(`o papel "${papel}" não tem avaliador: acrescente-o em "aplicaA" de algum avaliador (tarefa sem avaliador nunca é aprovada) ou ligue "aprovarSemAvaliador": true no config`);
      }
    }
  }
  if (cfg.roteador) {
    for (const papel of Object.keys(cfg.roteador.palavras ?? {})) if (!papeis.includes(papel)) p.push(`roteador: o papel "${papel}" não existe em "agentes"`);
    if (cfg.roteador.padrao !== undefined && !papeis.includes(cfg.roteador.padrao)) p.push(`roteador.padrao: o papel "${cfg.roteador.padrao}" não existe em "agentes"`);
  }
  const f = cfg.ferramentas;
  if (f !== undefined) {
    if (!ehObjeto(f)) p.push('"ferramentas" deve ser um objeto');
    else {
      if (f.comandoTestes !== undefined && (!Array.isArray(f.comandoTestes) || !f.comandoTestes.length || f.comandoTestes.some((c) => typeof c !== 'string'))) p.push('ferramentas.comandoTestes deve ser uma lista [executavel, ...argumentos]');
      if (f.timeoutMs !== undefined && !(Number.isInteger(f.timeoutMs) && f.timeoutMs >= 1000 && f.timeoutMs <= 250_000)) p.push('ferramentas.timeoutMs deve ser um inteiro de 1000 a 250000');
      for (const [papel, lista] of Object.entries(f.papeis ?? {})) {
        if (!papeis.includes(papel)) p.push(`ferramentas.papeis: o papel "${papel}" não existe em "agentes"`);
        if (!Array.isArray(lista) || lista.some((n) => !['ler_arquivo', 'listar_arquivos', 'git_diff', 'rodar_testes'].includes(n))) p.push(`ferramentas.papeis.${papel}: use nomes de ler_arquivo, listar_arquivos, git_diff, rodar_testes`);
        else if (lista.includes('rodar_testes') && !f.comandoTestes) p.push(`ferramentas.papeis.${papel}: rodar_testes exige ferramentas.comandoTestes`);
      }
    }
  }
  return p;
}

// ---- lições pendentes (persistidas) ---------------------------------------------------------------------------------------
function lerPendentes(arquivo) {
  if (!fs.existsSync(arquivo)) return [];
  let dados;
  try { dados = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { throw new Error(`arquivo de lições pendentes ilegível: ${arquivo}`); }
  if (!Array.isArray(dados?.licoes)) throw new Error(`arquivo de lições pendentes com formato inválido: ${arquivo}`);
  // o arquivo pode ter sido editado à mão ou vir de outra máquina: entra só o que passa na mesma validação das lições novas
  return dados.licoes.filter((l) => ehObjeto(l) && ID_LICAO.test(l.id ?? '') && ESCOPO.test(l.projeto ?? '') && motivoDaLicao(l) === null);
}

function gravarPendentes(arquivo, licoes) {
  const tmp = `${arquivo}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ licoes }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, arquivo);
}

const registrarDecisao = (arquivo, registro) => fs.appendFileSync(arquivo, `${JSON.stringify(registro)}\n`, { mode: 0o600 });

function arquivosDoEstado(cfg, base) {
  return {
    memoria: path.resolve(base, cfg.memoria?.arquivo ?? './memoria-do-time.jsonl'),
    pendentes: path.resolve(base, cfg.memoria?.licoesPendentes ?? './licoes-pendentes.json'),
    decididas: path.resolve(base, cfg.memoria?.licoesDecididas ?? './licoes-decididas.jsonl'),
    escopoGlobal: cfg.memoria?.escopoGlobal ?? 'global',
  };
}

async function licoesMain(argv, { saida, erro, cwd }) {
  let configArg;
  const posicionais = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config') { configArg = argv[i + 1]; i += 1; } else posicionais.push(argv[i]);
  }
  const [cmd, alvo, ...sobra] = posicionais;
  if (!['listar', 'aprovar', 'rejeitar'].includes(cmd) || (cmd !== 'listar' && !alvo) || sobra.length || (cmd === 'listar' && alvo) || (argv.includes('--config') && !configArg)) {
    erro(`erro: use "licoes listar", "licoes aprovar <id>" ou "licoes rejeitar <id>" (opcional: --config <arquivo>)\n\n${USO}`);
    return 2;
  }
  const arquivoConfig = path.resolve(cwd, configArg ?? 'time.config.json');
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(arquivoConfig, 'utf8')); } catch (e) { erro(`erro ao ler a configuração (${arquivoConfig}): ${e.message}`); return 2; }
  const est = arquivosDoEstado(cfg, path.dirname(arquivoConfig));
  let pendentes;
  try { pendentes = lerPendentes(est.pendentes); } catch (e) { erro(`erro: ${e.message}`); return 2; }

  if (cmd === 'listar') {
    if (!pendentes.length) { saida('Nenhuma lição pendente.'); return 0; }
    saida(`Lições pendentes (${pendentes.length}) — aprove com "licoes aprovar <id>":`);
    for (const l of pendentes) saida(`  ${l.id} [${l.projeto} · ${l.escopo}] ${l.tipo}/${l.chave}: ${paraTerminal(l.valor)}`);
    return 0;
  }
  const l = pendentes.find((x) => x.id === alvo);
  if (!l) { erro(`erro: não há lição pendente com o id ${paraTerminal(String(alvo)).slice(0, 40)}`); return 1; }
  if (cmd === 'aprovar') {
    try {
      const memoria = criarMemoria({ arquivo: est.memoria, escoposPermitidos: [est.escopoGlobal, l.projeto] });
      gravarLicao(memoria, l, { escopoProjeto: l.projeto, escopoGlobal: est.escopoGlobal });
    } catch (e) { erro(`não foi possível gravar ${l.id}: ${e.message}`); return 1; }
  }
  gravarPendentes(est.pendentes, pendentes.filter((x) => x.id !== alvo));
  registrarDecisao(est.decididas, { id: alvo, acao: cmd === 'aprovar' ? 'aprovada' : 'rejeitada', quando: new Date().toISOString(), projeto: l.projeto, chave: l.chave, escopo: l.escopo });
  saida(`${l.id} ${cmd === 'aprovar' ? 'gravada na memória' : 'rejeitada'}.`);
  return 0;
}

// ---- execução -------------------------------------------------------------------------------------------------------------
function lerEntrada(arquivo, cwd) {
  const abs = path.resolve(cwd, arquivo);
  let st;
  try { st = fs.statSync(abs); } catch { throw new Error(`--entrada: arquivo não encontrado (${paraTerminal(arquivo).slice(0, 80)})`); }
  if (!st.isFile()) throw new Error('--entrada deve ser um arquivo');
  if (st.size > LIMITES.entrada * 4) throw new Error(`--entrada: arquivo grande demais (máximo de ${LIMITES.entrada} caracteres)`);
  const bruto = fs.readFileSync(abs);
  if (bruto.includes(0)) throw new Error('--entrada: arquivo binário não é aceito');
  const texto = bruto.toString('utf8').replace(/^﻿/, '');
  if (!texto.trim()) throw new Error('--entrada: o arquivo está vazio');
  if (texto.length > LIMITES.entrada) throw new Error(`--entrada: ${texto.length} caracteres; o máximo é ${LIMITES.entrada} (recorte o trecho que importa)`);
  if (acharSegredos(texto).length) throw new Error('--entrada: o arquivo parece conter uma credencial; remova antes de enviar ao modelo');
  return texto;
}

function ferramentasPorPapel(cfg, raiz, papeis, eventos) {
  const f = cfg.ferramentas ?? {};
  const todas = criarFerramentasDoProjeto({ raiz, comandoTestes: f.comandoTestes, timeoutMs: f.timeoutMs });
  const leitura = ['ler_arquivo', 'listar_arquivos', 'git_diff'];
  const porPapel = {};
  for (const papel of papeis) {
    const nomes = f.papeis?.[papel] ?? leitura;
    const escolhidas = todas.filter((t) => nomes.includes(t.nome));
    if (!escolhidas.length) continue;
    const registro = criarRegistro({ permissoes: escolhidas.some((t) => t.risco === 'escrita') ? ['leitura', 'escrita'] : ['leitura'], auditoria: (e) => eventos.push({ papel, ...e }), timeoutMs: (f.timeoutMs ?? 60_000) * 2 + 5000 });
    escolhidas.forEach((t) => registro.registrar(t));
    porPapel[papel] = registro;
  }
  return { porPapel, rodaTestes: todas.some((t) => t.nome === 'rodar_testes') && papeis.some((p) => (f.papeis?.[p] ?? []).includes('rodar_testes')) };
}

export async function main(argv, { env = process.env, saida = console.log, erro = console.error, stdin = process.stdin, cwd = process.cwd(), perguntar: perguntarInjetado } = {}) {
  if (argv[0] === 'licoes') return licoesMain(argv.slice(1), { saida, erro, cwd });
  let a;
  try { a = lerArgs(argv); } catch (e) { erro(`erro: ${e.message}\n\n${USO}`); return 2; }
  const arquivoConfig = path.resolve(cwd, a.config ?? 'time.config.json');
  let carregado;
  try { carregado = carregarConfig(arquivoConfig); } catch (e) { erro(`erro ao ler a configuração (${arquivoConfig}): ${e.message}`); return 2; }
  const { cfg, base, agentesCfg, avaliadoresCfg } = carregado;
  const papeis = Object.keys(agentesCfg);
  const problemas = conferirConfig(carregado);
  if (problemas.length) { erro(`erro na configuração (${arquivoConfig}):\n- ${problemas.join('\n- ')}`); return 2; }

  let entrada;
  try { entrada = a.entrada ? lerEntrada(a.entrada, cwd) : undefined; } catch (e) { erro(`erro: ${e.message}`); return 2; }
  const raiz = a.raiz ? path.resolve(cwd, a.raiz) : undefined;
  if (raiz && !fs.existsSync(raiz)) { erro(`erro: --raiz não existe (${paraTerminal(a.raiz).slice(0, 80)})`); return 2; }

  const clientes = new Map();
  const leitor = { l: undefined }; // terminal interativo (criado só se for preciso perguntar algo)
  let chamarModelo;
  try {
    const clienteDe = (modelo) => {
      const chave = modelo ?? '';
      if (!clientes.has(chave)) clientes.set(chave, criarClienteHttp({ env: modelo ? { ...env, MODELO_CHAT: modelo } : env }));
      return clientes.get(chave);
    };
    chamarModelo = clienteDe(undefined);
    // enviar código/arquivos a um modelo fora da máquina é uma decisão do dono, não um efeito colateral
    const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(chamarModelo.info.baseURL ?? '');
    if (!local && (entrada || raiz) && !a['confirmo-envio-externo']) {
      erro(`erro: o modelo (${chamarModelo.info.baseURL}) não está na sua máquina e você passou ${entrada ? '--entrada' : ''}${entrada && raiz ? ' e ' : ''}${raiz ? '--raiz' : ''}: o conteúdo seria enviado a esse serviço. Se é isso mesmo que você quer, repita com --confirmo-envio-externo`);
      return 2;
    }
    const ferramentas = { porPapel: {}, rodaTestes: false };
    const eventos = [];
    if (raiz) Object.assign(ferramentas, ferramentasPorPapel(cfg, raiz, papeis, eventos));
    const agentes = Object.fromEntries(papeis.map((p) => [p, criarAgenteDeLLM({
      persona: agentesCfg[p].texto, chamarModelo: clienteDe(agentesCfg[p].modelo), papeis, registro: ferramentas.porPapel[p], maxPassos: agentesCfg[p].maxPassos ?? 6, quem: p,
    })]));
    const avaliadores = avaliadoresCfg.map((av) => criarAvaliadorDeLLM({
      nome: av.nome, persona: av.texto, chamarModelo: clienteDe(av.modelo), limiar: av.limiar ?? 0.8,
      aplicaA: av.aplicaA ? (t) => av.aplicaA.includes(t.papel) : undefined,
    }));
    const est = arquivosDoEstado(cfg, base);
    const memoria = criarMemoria({ arquivo: est.memoria, escoposPermitidos: [est.escopoGlobal, a.projeto] });
    const perguntar = perguntarInjetado ?? (async (texto) => {
      leitor.l ??= readline.createInterface({ input: stdin, output: process.stdout });
      return leitor.l.question(texto);
    });
    const interativo = Boolean(stdin.isTTY || perguntarInjetado);
    const humano = interativo ? async (info) => {
      saida(`\n— Preciso de uma decisão sobre ${info.tarefa}: ${paraTerminal(info.titulo)}\n  Motivo: ${paraTerminal(info.motivo)}`);
      for (const f of info.feedback) saida(`  feedback: ${paraTerminal(f).slice(0, 300)}`);
      if (info.entrega) saida(`  entrega (início):\n${neutralizarControles(info.entrega).slice(0, 1500).split('\n').map((x) => `    ${x}`).join('\n')}`);
      if (info.propostas?.novas_tarefas.length) saida(`  a entrega propõe criar tarefas: ${info.propostas.novas_tarefas.map((t) => paraTerminal(t)).join('; ')}`);
      return { acao: /^s(im)?$/i.test((await perguntar('  Aprovar esta entrega mesmo assim? [s/N] ')).trim()) ? 'aprovar' : 'rejeitar' };
    } : undefined;

    const orq = criarOrquestrador({
      agentes, avaliadores, memoria, escopoProjeto: a.projeto, escopoGlobal: est.escopoGlobal, orcamento: cfg.orcamento, humano,
      aprovarSemAvaliador: cfg.aprovarSemAvaliador === true,
      delegacoes: cfg.delegacoes,
      roteador: cfg.roteador ? roteadorPorPalavrasChave(cfg.roteador.palavras ?? {}, cfg.roteador.padrao ?? papeis[0]) : undefined,
      auditoria: (e) => eventos.push(e),
    });

    saida(`Delegando ao time (projeto ${a.projeto}): ${a.titulo}`);
    saida(`Modelo: ${chamarModelo.info.modelo} em ${chamarModelo.info.baseURL}${raiz ? ` · ferramentas em ${raiz}${ferramentas.rodaTestes ? ' (INCLUI rodar testes: executa o código do projeto)' : ''}` : ''}${entrada ? ` · entrada de ${entrada.length} caracteres` : ''}`);
    let r;
    try {
      // sem --papel e sem roteador no config: o "manager" (que decompõe) ou, na falta dele, o primeiro papel configurado
      const papelRaiz = a.papel ?? (cfg.roteador ? undefined : (papeis.includes('manager') ? 'manager' : papeis[0]));
      r = await orq.executar({ titulo: a.titulo, descricao: a.descricao, criterios: a.criterios, papel: papelRaiz, entrada });
    } catch (e) { erro(`erro: ${e.message}`); return 1; }

    saida(`\nResultado: ${r.parada} · ${r.chamadas} chamadas · ${Object.entries(r.porEstado).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    for (const t of r.tarefas) {
      const nota = t.avaliacoes.filter((x) => x.nota !== undefined).at(-1)?.nota;
      saida(`  ${t.id} [${t.estado}] ${t.papel}: ${paraTerminal(t.titulo)}${t.pai ? ` (filha de ${t.pai})` : ''} · ${t.tentativas} tentativa(s)${nota !== undefined ? ` · nota ${nota}` : ''}${t.motivo ? ` · ${t.motivo}` : ''}`);
    }
    for (const rj of r.rejeitadas) saida(`  proposta rejeitada: "${paraTerminal(rj.proposta.titulo)}" (${rj.motivo})`);

    // Aprendizados: nada vai para a memória sem aprovação; o que não for aprovado agora fica PENDENTE em disco.
    const modo = a['aprovar-licoes'] ?? (interativo ? 'perguntar' : 'nenhuma');
    const gravadas = [];
    const deixadas = [];
    if (r.licoes.length) saida(`\nAprendizados propostos (${r.licoes.length}):`);
    for (const l of r.licoes) {
      saida(`  ${l.id} [${l.escopo}] ${l.tipo}/${paraTerminal(l.chave)}: ${paraTerminal(l.valor)}`);
      let decisao = modo === 'todas' || (modo === 'projeto' && l.escopo === 'projeto') ? 'sim' : 'depois';
      if (modo === 'perguntar') {
        const resp = (await perguntar(`    guardar na memória (${l.escopo})? [s]im / [n]ão / [d]epois (padrão) `)).trim().toLowerCase();
        decisao = /^s(im)?$/.test(resp) ? 'sim' : /^n(ao|ão)?$/.test(resp) ? 'nao' : 'depois';
      }
      try {
        if (decisao === 'sim') { orq.aprovarLicao(l.id); gravadas.push(l.id); } else if (decisao === 'nao') orq.rejeitarLicao(l.id); else deixadas.push(l);
      } catch (e) { erro(`    não foi possível gravar ${l.id}: ${e.message}`); deixadas.push(l); }
    }
    if (deixadas.length) {
      const execId = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
      try {
        const atuais = lerPendentes(est.pendentes);
        const novas = deixadas.map((l) => ({ id: `lp-${execId}-${l.id}`, projeto: a.projeto, tipo: l.tipo, chave: l.chave, valor: l.valor, escopo: l.escopo, origem: l.origem, estado: 'pendente', criado_em: new Date().toISOString() }));
        gravarPendentes(est.pendentes, [...atuais, ...novas].slice(-200));
        saida(`  ${deixadas.length} lição(ões) ficaram PENDENTES em ${est.pendentes} — veja com "licoes listar".`);
      } catch (e) { erro(`    não foi possível guardar as lições pendentes: ${e.message}`); }
    }
    if (r.licoes.length) saida(`  gravadas: ${gravadas.length ? gravadas.join(', ') : 'nenhuma'}`);

    const pasta = path.resolve(cwd, a.saida ?? 'execucoes');
    fs.mkdirSync(pasta, { recursive: true });
    const nome = `${new Date().toISOString().replace(/[:.]/g, '-')}-${a.projeto}.json`;
    // a entrada pode ser código ou dado do dono: o relatório guarda só o tamanho e a impressão digital dela
    const tarefas = r.tarefas.map(({ entrada: texto, ...t }) => (texto === undefined ? t : { ...t, entrada: { caracteres: texto.length, sha256: crypto.createHash('sha256').update(texto).digest('hex') } }));
    const relatorio = mascararProfundo({ projeto: a.projeto, modelo: [...clientes.values()].map((c) => c.info), parada: r.parada, chamadas: r.chamadas, porEstado: r.porEstado, tarefas, licoes: orq.licoes(), rejeitadas: r.rejeitadas, auditoria: eventos });
    fs.writeFileSync(path.join(pasta, nome), JSON.stringify(relatorio, null, 2), { mode: 0o600 });
    saida(`\nRelatório: ${path.join(pasta, nome)}`);
    return r.tarefas.every((t) => t.estado === 'aprovada') ? 0 : 1;
  } catch (e) {
    erro(`erro: ${e.message}`);
    return 2;
  } finally {
    leitor.l?.close();
  }
}

if (ehPrincipal(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
