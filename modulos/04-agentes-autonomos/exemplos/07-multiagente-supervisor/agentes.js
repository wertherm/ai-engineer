// Três especialistas + um supervisor. Analista e planejador usam o LLM; o executor é código
// determinístico com allowlist de ações (o LLM planeja, mas quem age é o código).
import { chat, extrairJson } from '../../comum/llm.js';

const PRECOS = { pao: 1.5, cafe: 4, suco: 6, frutas: 5, bolo: 8 }; // R$ por pessoa
const ACOES = ['cotar', 'reservar_sala', 'enviar_convite'];

export async function analista(bus) {
  const m = await bus.receber('analista');
  const { msg } = await chat([
    { role: 'system', content: 'Extraia os requisitos do pedido. Devolva só JSON {"pessoas":n,"dia":"...","orcamento":n}.' },
    { role: 'user', content: m.conteudo },
  ], { maxTokens: 50 });
  bus.enviar('analista', 'supervisor', 'requisitos', extrairJson(msg.content));
}

export async function planejador(bus) {
  for (let rodada = 1; rodada <= 2; rodada++) {
    const m = await bus.receber('planejador');
    if (m.tipo === 'encerrar') return;
    const { msg } = await chat([
      { role: 'system', content: `Planeje um café da manhã. Itens possíveis e custo por pessoa: ${JSON.stringify(PRECOS)}. ` +
        'Devolva só JSON {"itens":["..."],"dia":"..."} respeitando o orçamento total (custo x pessoas).' },
      { role: 'user', content: JSON.stringify(m.conteudo) },
    ], { maxTokens: 60 });
    bus.enviar('planejador', 'supervisor', 'plano', extrairJson(msg.content));
  }
}

export async function executor(bus) {
  for (;;) {
    const m = await bus.receber('executor');
    if (m.tipo === 'encerrar') return;
    const { plano, requisitos } = m.conteudo;
    const passos = [
      { acao: 'cotar', itens: plano.itens },
      { acao: 'reservar_sala', dia: plano.dia },
      { acao: 'enviar_convite', pessoas: requisitos.pessoas },
    ];
    const negadas = passos.filter((p) => !ACOES.includes(p.acao));
    if (negadas.length) { bus.enviar('executor', 'supervisor', 'falha', { motivo: 'ação fora da allowlist' }); continue; }
    const desconhecidos = plano.itens.filter((i) => !(i in PRECOS));
    const total = plano.itens.reduce((t, i) => t + (PRECOS[i] ?? 0), 0) * requisitos.pessoas;
    if (desconhecidos.length || total > requisitos.orcamento) {
      bus.enviar('executor', 'supervisor', 'falha', { motivo: desconhecidos.length ? `itens desconhecidos: ${desconhecidos}` : `custo R$ ${total} > orçamento R$ ${requisitos.orcamento}`, total });
      continue;
    }
    // Ações independentes rodam em paralelo (latência simulada de serviços externos).
    const atraso = (ms, r) => new Promise((ok) => setTimeout(() => ok(r), ms));
    const feitos = await Promise.all([
      atraso(300, `cotação ok: R$ ${total}`),
      atraso(200, `sala reservada: ${plano.dia}`),
      atraso(100, `${requisitos.pessoas} convites enviados`),
    ]);
    bus.enviar('executor', 'supervisor', 'concluido', { total, feitos });
  }
}

/** Supervisor: decide quem trabalha a seguir com base no TIPO da última mensagem (roteamento). */
export async function supervisor(bus, pedido) {
  bus.enviar('supervisor', 'analista', 'pedido', pedido);
  let requisitos;
  let plano;
  for (;;) {
    const m = await bus.receber('supervisor');
    if (m.tipo === 'requisitos') { requisitos = m.conteudo; bus.enviar('supervisor', 'planejador', 'planejar', requisitos); }
    else if (m.tipo === 'plano') { plano = m.conteudo; bus.enviar('supervisor', 'executor', 'executar', { plano, requisitos }); }
    else if (m.tipo === 'falha' && !requisitos.feedback) {
      // Delegação com feedback: devolve ao planejador UMA vez (evita loop infinito entre agentes).
      requisitos = { ...requisitos, feedback: `plano anterior ${JSON.stringify(plano.itens)} falhou: ${m.conteudo.motivo}. Corte itens.` };
      bus.enviar('supervisor', 'planejador', 'replanejar', requisitos);
    } else {
      bus.enviar('supervisor', 'executor', 'encerrar', null);
      bus.enviar('supervisor', 'planejador', 'encerrar', null);
      return { status: m.tipo, plano, requisitos, resultado: m.conteudo };
    }
  }
}
