// Núcleo do bot de ChatOps, independente de Slack/Discord/Teams: recebe (usuário, texto) e devolve
// a resposta. O adaptador de cada plataforma só traduz eventos → bot.receber() → mensagem.
import { chat } from '../../comum/llm.js';
import { kubectl } from '../../comum/shell.js';

export const NS = 'm06-chatops';

// RBAC: papel → comandos permitidos. Quem pode APROVAR é uma permissão separada.
const PAPEIS = {
  viewer: { comandos: ['investigar'], aprova: false },
  dev: { comandos: ['investigar', 'scale', 'deploy'], aprova: false },
  sre: { comandos: ['investigar', 'scale', 'deploy', 'rollback'], aprova: true },
};
// Comandos que mudam o cluster precisam de aprovação humana de OUTRA pessoa (four-eyes).
const CRITICOS = new Set(['scale', 'deploy', 'rollback']);

export class BotChatOps {
  constructor({ usuarios, auditar, limiteFalhas = 2, pausaMs = 120_000, maxAcoesPorMin = 3 }) {
    this.usuarios = usuarios; // { nome: papel }
    this.auditar = auditar; // (registro) => Promise
    this.pendentes = new Map();
    this.seq = 0;
    // Circuit breaker: N falhas seguidas abrem o circuito e bloqueiam mutações por um tempo.
    this.cb = { falhas: 0, limite: limiteFalhas, abertoAte: 0, pausaMs };
    this.acoes = []; // timestamps das execuções (rate limit)
    this.maxAcoesPorMin = maxAcoesPorMin;
  }

  async receber(usuario, texto) {
    const papel = this.usuarios[usuario];
    const [cmdBruto, ...args] = texto.trim().split(/\s+/);
    const cmd = cmdBruto.replace(/^\//, '');
    const registrar = (decisao, detalhe = '') => this.auditar({ usuario, papel: papel ?? '-', comando: texto, decisao, detalhe });

    if (!papel) return registrar('negado', 'usuário desconhecido').then(() => '⛔ usuário sem papel no RBAC');
    if (cmd === 'aprovar') return this.aprovar(usuario, papel, Number(args[0]), registrar);
    if (!PAPEIS[papel].comandos.includes(cmd)) {
      await registrar('negado', `papel ${papel} não pode /${cmd}`);
      return `⛔ RBAC: papel "${papel}" não pode usar /${cmd}`;
    }
    if (cmd === 'investigar') return this.investigar(args[0], registrar);

    // Comando crítico: monta a ação, mostra o impacto (dry-run + diff) e fica pendente de aprovação.
    const acao = montarAcao(cmd, args);
    if (acao.erro) return registrar('invalido', acao.erro).then(() => `⚠️ ${acao.erro}`);
    const impacto = await analisarImpacto(acao);
    if (!impacto.ok) return registrar('invalido', impacto.texto).then(() => `⚠️ dry-run falhou: ${impacto.texto}`);
    const id = ++this.seq;
    this.pendentes.set(id, { ...acao, solicitante: usuario });
    await registrar('pendente', `#${id} ${impacto.texto}`);
    return `📝 #${id} aguardando aprovação de um SRE (outra pessoa). Impacto (dry-run): ${impacto.texto}`;
  }

  async aprovar(usuario, papel, id, registrar) {
    const p = this.pendentes.get(id);
    if (!p) return `⚠️ pedido #${id} não existe`;
    if (!PAPEIS[papel].aprova) return registrar('negado', `#${id}: papel ${papel} não aprova`).then(() => `⛔ papel "${papel}" não aprova`);
    if (p.solicitante === usuario) return registrar('negado', `#${id}: autoaprovação`).then(() => '⛔ four-eyes: quem pede não aprova');

    // Guardrails de execução: circuito aberto e rate limit valem mesmo com aprovação.
    if (Date.now() < this.cb.abertoAte) {
      await registrar('bloqueado', `#${id}: circuit breaker aberto`);
      return `🔌 circuit breaker ABERTO após ${this.cb.limite} falhas seguidas: mutações suspensas, investigue antes`;
    }
    this.acoes = this.acoes.filter((t) => Date.now() - t < 60_000);
    if (this.acoes.length >= this.maxAcoesPorMin) return registrar('bloqueado', 'rate limit').then(() => '🐢 rate limit: muitas ações no último minuto');
    this.acoes.push(Date.now());
    this.pendentes.delete(id);

    const r = await executar(p);
    this.cb.falhas = r.ok ? 0 : this.cb.falhas + 1;
    if (this.cb.falhas >= this.cb.limite) this.cb.abertoAte = Date.now() + this.cb.pausaMs;
    await registrar(r.ok ? 'executado' : 'falhou', `#${id} aprovado por ${usuario}: ${r.texto}`);
    return `${r.ok ? '✅' : '❌'} #${id} (${p.descricao}) aprovado por ${usuario}: ${r.texto}`;
  }

  async investigar(alvo, registrar) {
    // Coleta determinística + 1 chamada curta ao LLM só para resumir em linguagem de humano.
    const pods = await kubectl(['-n', NS, 'get', 'pods', '-l', `app=${alvo}`, '--no-headers']);
    const ev = await kubectl(['-n', NS, 'get', 'events', '--sort-by=.lastTimestamp', '--no-headers',
      '-o', 'custom-columns=MOTIVO:.reason,MSG:.message']);
    const evidencias = `PODS:\n${pods.stdout.trim()}\nEVENTOS RECENTES:\n${ev.stdout.trim().split('\n').slice(-5).join('\n')}`;
    const { msg } = await chat([
      { role: 'system', content: 'Você é um SRE. Resuma em no máximo 2 frases, em português, a saúde do serviço e a próxima ação.' },
      { role: 'user', content: evidencias.slice(0, 1500) },
    ], { maxTokens: 90 });
    await registrar('executado', 'investigação (somente leitura)');
    return `🔎 ${msg.content.trim()}`;
  }
}

/** Traduz o comando em argv de kubectl. Nada de texto livre indo para o shell. */
function montarAcao(cmd, args) {
  const [alvo, valor] = args;
  if (!/^[a-z][-a-z0-9]{0,30}$/.test(alvo ?? '')) return { erro: 'alvo inválido' };
  if (cmd === 'scale') {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 0 || n > 6) return { erro: 'réplicas devem ser 0..6 (guardrail)' };
    return { alvo, descricao: `scale ${alvo}=${n}`, argv: ['-n', NS, 'scale', `deploy/${alvo}`, `--replicas=${n}`], rollout: false };
  }
  if (cmd === 'deploy') {
    if (!/^[\w./-]+:[\w.-]+$/.test(valor ?? '') || valor.endsWith(':latest')) return { erro: 'imagem precisa de tag explícita (sem :latest)' };
    return { alvo, descricao: `deploy ${alvo} → ${valor}`, argv: ['-n', NS, 'set', 'image', `deploy/${alvo}`, `${alvo}=${valor}`], rollout: true };
  }
  return { alvo, descricao: `rollback ${alvo}`, argv: ['-n', NS, 'rollout', 'undo', `deploy/${alvo}`], rollout: true };
}

/** Impacto antes de aprovar: dry-run no servidor e, quando dá, o diff do que muda. */
async function analisarImpacto(acao) {
  if (acao.argv.includes('undo')) {
    const h = await kubectl(['-n', NS, 'rollout', 'history', `deploy/${acao.alvo}`]);
    return { ok: h.ok, texto: h.ok ? `volta para a revisão anterior (${h.stdout.trim().split('\n').length - 2} revisões no histórico)` : h.stderr.trim() };
  }
  const dry = await kubectl([...acao.argv, '--dry-run=server', '-o', 'yaml']);
  if (!dry.ok) return { ok: false, texto: dry.stderr.trim() };
  const diff = await kubectl(['diff', '-f', '-'], { input: dry.stdout }); // exit 1 = há diferenças
  const linhas = diff.stdout.split('\n').filter((l) => /^[-+]\s/.test(l) && !/generation|resourceVersion|managedFields|time:/.test(l));
  return { ok: true, texto: linhas.map((l) => l.replace(/\s+/g, ' ').trim()).join(' ') || 'sem mudança' };
}

/** Executa e VALIDA: para deploy/rollback, só é sucesso se o rollout ficar pronto. */
async function executar(acao) {
  const r = await kubectl(acao.argv);
  if (!r.ok) return { ok: false, texto: r.stderr.trim() };
  if (!acao.rollout) return { ok: true, texto: r.stdout.trim() };
  const st = await kubectl(['-n', NS, 'rollout', 'status', `deploy/${acao.alvo}`, '--timeout=40s']);
  if (st.ok) return { ok: true, texto: 'rollout pronto' };
  // Mitigação automática do próprio bot: desfaz a mudança que não ficou pronta.
  await kubectl(['-n', NS, 'rollout', 'undo', `deploy/${acao.alvo}`]);
  await kubectl(['-n', NS, 'rollout', 'status', `deploy/${acao.alvo}`, '--timeout=60s']);
  return { ok: false, texto: 'rollout não ficou pronto em 40s → desfeito automaticamente' };
}
