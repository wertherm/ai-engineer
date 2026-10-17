// Grafo LangGraph.js de um agente bancário de brinquedo, com:
//   roteamento condicional · retry (retryPolicy) · fallback · checkpoint (MemorySaver)
//   human-in-the-loop (interrupt + Command) · guardrails (escopo, passos, orçamento, allowlist) · auditoria
import { StateGraph, Annotation, START, END, MemorySaver, interrupt } from '@langchain/langgraph';
import { chat, extrairJson } from '../../comum/llm.js';

export const LIMITES = { maxPassos: 8, orcamentoTokens: 1500, allowlist: ['consultar_saldo', 'transferir'] };
const BLOQUEADOS = /senha|apagar|drop|deletar|produção/i; // fora do escopo do agente

const Estado = Annotation.Root({
  pedido: Annotation(),
  intencao: Annotation(),
  args: Annotation(),
  resposta: Annotation(),
  passos: Annotation({ reducer: (a, b) => a + b, default: () => 0 }),
  tokens: Annotation({ reducer: (a, b) => a + b, default: () => 0 }),
  // Trilha de auditoria: cada nó ACRESCENTA eventos (reducer de concatenação).
  auditoria: Annotation({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

const evento = (no, decisao, detalhe = {}) => ({ ts: new Date().toISOString(), no, decisao, detalhe });

// "API" de saldo instável: falha nas 2 primeiras chamadas (erro transitório) e responde na 3ª.
const contas = { 123: 1500, 456: 80 };
let falhasRestantes = 2;
async function apiSaldo(conta) {
  if (falhasRestantes-- > 0) {
    console.log('  ↻ apiSaldo: 503 (simulado); o retryPolicy vai reexecutar o nó');
    throw new Error('503 Service Unavailable (simulado)');
  }
  if (!(conta in contas)) throw new Error(`conta ${conta} inexistente`);
  return contas[conta];
}

// Guardrail de ferramenta: só roda o que está na allowlist.
function usarFerramenta(nome) {
  if (!LIMITES.allowlist.includes(nome)) throw new Error(`ferramenta fora da allowlist: ${nome}`);
}

async function guardrailEntrada(s) {
  const bloqueado = BLOQUEADOS.test(s.pedido);
  return { passos: 1, intencao: bloqueado ? 'bloqueado' : undefined,
    auditoria: [evento('guardrail_entrada', bloqueado ? 'BLOQUEADO (fora do escopo)' : 'ok', { pedido: s.pedido })] };
}

async function classificar(s) {
  const { msg, usage } = await chat([
    { role: 'system', content: 'Classifique o pedido bancário. Devolva só JSON {"intencao":"saldo"|"transferencia"|"outro","conta":"<origem>","destino":"<conta ou vazio>","valor":<número ou 0>}.' },
    { role: 'user', content: s.pedido },
  ], { maxTokens: 60 });
  let dados;
  try { dados = extrairJson(msg.content); } catch { dados = { intencao: 'outro' }; }
  return { passos: 1, tokens: usage.total_tokens, intencao: dados.intencao, args: dados,
    auditoria: [evento('classificar', `intencao=${dados.intencao}`, { saida_llm: msg.content, tokens: usage.total_tokens })] };
}

async function consultarSaldo(s) {
  usarFerramenta('consultar_saldo');
  const saldo = await apiSaldo(String(s.args.conta)); // se lançar, o retryPolicy do nó tenta de novo
  return { passos: 1, resposta: `Saldo da conta ${s.args.conta}: R$ ${saldo}`,
    auditoria: [evento('consultar_saldo', 'ok', { conta: s.args.conta, saldo })] };
}

async function aprovacaoHumana(s) {
  // interrupt() PAUSA o grafo e salva o estado no checkpointer. Quem chamou recebe o payload
  // em __interrupt__ e retoma depois com new Command({ resume: ... }). O nó reexecuta do início
  // na retomada, por isso nada com efeito colateral deve vir ANTES do interrupt.
  const decisao = interrupt({ pergunta: 'Aprovar transferência?', ...s.args });
  return { passos: 1, intencao: decisao === 'aprovar' ? 'transferencia_aprovada' : 'transferencia_negada',
    auditoria: [evento('aprovacao_humana', decisao, { aprovador: 'operador@exemplo' })] };
}

async function transferir(s) {
  usarFerramenta('transferir');
  const { conta, destino, valor } = s.args;
  if (contas[conta] < valor) throw new Error('saldo insuficiente');
  contas[conta] -= valor; contas[destino] = (contas[destino] ?? 0) + valor;
  return { passos: 1, resposta: `Transferidos R$ ${valor} de ${conta} para ${destino}.`,
    auditoria: [evento('transferir', 'executado', { conta, destino, valor })] };
}

async function fallback(s) {
  const motivo = s.intencao === 'bloqueado' ? 'pedido fora do escopo'
    : s.intencao === 'transferencia_negada' ? 'operador negou a transferência'
    : s.passos >= LIMITES.maxPassos ? 'limite de passos' : s.tokens > LIMITES.orcamentoTokens ? 'orçamento de tokens' : 'não sei tratar este pedido';
  return { passos: 1, resposta: `Não executei: ${motivo}. Encaminhado para atendimento humano.`,
    auditoria: [evento('fallback', motivo)] };
}

// Roteadores: funções puras do estado -> nome do próximo nó. Guardrails de passos/orçamento entram aqui.
function excedeuLimites(s) { return s.passos >= LIMITES.maxPassos || s.tokens > LIMITES.orcamentoTokens; }
const rotaEntrada = (s) => (s.intencao === 'bloqueado' ? 'fallback' : 'classificar');
const rotaIntencao = (s) => {
  if (excedeuLimites(s)) return 'fallback';
  if (s.intencao === 'saldo') return 'consultar_saldo';
  if (s.intencao === 'transferencia' && Number(s.args.valor) > 0) return 'aprovacao_humana';
  return 'fallback';
};
const rotaAprovacao = (s) => (s.intencao === 'transferencia_aprovada' ? 'transferir' : 'fallback');

export function criarGrafo() {
  return new StateGraph(Estado)
    .addNode('guardrail_entrada', guardrailEntrada)
    .addNode('classificar', classificar)
    .addNode('consultar_saldo', consultarSaldo, {
      retryPolicy: { maxAttempts: 3, initialInterval: 200, jitter: false, logWarning: false },
    })
    .addNode('aprovacao_humana', aprovacaoHumana)
    .addNode('transferir', transferir)
    .addNode('fallback', fallback)
    .addEdge(START, 'guardrail_entrada')
    .addConditionalEdges('guardrail_entrada', rotaEntrada, ['classificar', 'fallback'])
    .addConditionalEdges('classificar', rotaIntencao, ['consultar_saldo', 'aprovacao_humana', 'fallback'])
    .addConditionalEdges('aprovacao_humana', rotaAprovacao, ['transferir', 'fallback'])
    .addEdge('consultar_saldo', END)
    .addEdge('transferir', END)
    .addEdge('fallback', END)
    .compile({ checkpointer: new MemorySaver() }); // checkpoint por thread_id: permite pausar/retomar
}
