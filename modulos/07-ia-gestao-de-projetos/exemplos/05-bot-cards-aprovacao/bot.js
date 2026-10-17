// Bot de cards: pedido em linguagem natural -> plano de operações (LLM) -> política (código) -> API -> trilha.
// Uso: node bot.js "pedido" [--aprovador=nome]
import { z } from 'zod';
import { extrairJson } from '../../lib/llm.js';
import { trello } from './trello.js';
import { precisaAprovacao, lembretes, mensagemSlack } from './politica.js';
import { prepararTrilha, registrar, verificarTrilha, pool } from './trilha.js';

const BOARD = process.env.TRELLO_BOARD ?? 'b1';
const pedido = process.argv[2] ?? 'Crie um card "Aviso por e-mail" no Backlog com prioridade média e mova a Regra dos 60 dias para Feito';
const aprovador = process.argv.find((a) => a.startsWith('--aprovador='))?.split('=')[1] ?? null;
const solicitante = process.env.USER ?? 'desconhecido';

const [listas, etiquetas, cards] = await Promise.all([trello.listas(BOARD), trello.etiquetas(BOARD), trello.cards(BOARD)]);

// Schema gerado do estado do board: o LLM só consegue citar listas e cards que existem.
const Plano = z.object({
  operacoes: z.array(z.object({
    acao: z.enum(['criar', 'mover', 'priorizar', 'arquivar']),
    card: z.string().describe('título do card novo (criar) ou exatamente o título de um card existente'),
    lista: z.enum(listas.map((l) => l.name)).describe('lista de destino (criar/mover); senão repita a atual'),
    prioridade: z.enum(['alta', 'media', 'baixa', 'manter']),
  })),
});

const estado = cards.map((c) => `- "${c.name}" em ${listas.find((l) => l.id === c.idList).name}`).join('\n');
const plano = await extrairJson({
  schema: Plano,
  nome: 'plano',
  system: `Você traduz pedidos em operações de um quadro Trello. Uma operação por verbo do pedido.
Verbos: criar/adicionar -> criar; mover/levar/concluir -> mover; priorizar/urgente -> priorizar;
arquivar/remover/excluir -> arquivar. Use a lista exatamente como o pedido diz.
prioridade: a citada no pedido (média = media); se o pedido não cita, "manter".
Exemplo: "arquive X" -> {"acao":"arquivar","card":"X","lista":<lista atual de X>,"prioridade":"manter"}.
Cards existentes:\n${estado}`,
  user: pedido,
  maxTokens: 300,
});
console.log(`Pedido: ${pedido}\nPlano do LLM:`, plano.operacoes);

await prepararTrilha();
const idLista = (nome) => listas.find((l) => l.name === nome).id;
const idEtiqueta = (p) => etiquetas.find((e) => e.name === p).id;

for (const op of plano.operacoes) {
  const existente = cards.find((c) => c.name.toLowerCase() === op.card.toLowerCase());
  const registro = { solicitante, pedido, operacao: op };
  try {
    if (op.acao !== 'criar' && !existente) throw new Error(`card "${op.card}" não existe`);
    const motivo = precisaAprovacao(op);
    if (motivo && !aprovador) {
      await registrar({ ...registro, status: 'aguardando_aprovacao', motivo });
      console.log(`⏸  ${op.acao} "${op.card}": aguardando aprovação (${motivo})`);
      continue;
    }
    if (op.acao === 'criar') {
      const dados = { idList: idLista(op.lista), name: op.card };
      if (op.prioridade !== 'manter') dados.idLabels = [idEtiqueta(op.prioridade)];
      const novo = await trello.criarCard(dados);
      console.log(`✅ criado ${novo.id} "${novo.name}"`);
    } else if (op.acao === 'mover') {
      await trello.atualizarCard(existente.id, { idList: idLista(op.lista) });
      console.log(`✅ movido "${existente.name}" → ${op.lista}`);
    } else if (op.acao === 'priorizar') {
      await trello.atualizarCard(existente.id, { idLabels: [idEtiqueta(op.prioridade)] });
      console.log(`✅ "${existente.name}" agora com prioridade ${op.prioridade}`);
    } else if (op.acao === 'arquivar') {
      await trello.atualizarCard(existente.id, { closed: true });
      console.log(`✅ arquivado "${existente.name}"`);
    }
    await registrar({ ...registro, status: motivo ? 'aprovado_e_executado' : 'executado', motivo: motivo ? `aprovado por ${aprovador}` : null });
  } catch (e) {
    await registrar({ ...registro, status: 'erro', motivo: e.message });
    console.log(`❌ ${op.acao} "${op.card}": ${e.message}`);
  }
}

// Regras de lembrete rodam sobre o estado ATUAL do board (depois das operações).
const avisos = lembretes(await trello.cards(BOARD), listas, new Date('2026-11-02T12:00:00Z'));
if (avisos.length) console.log('\nSlack (não enviado):', JSON.stringify(mensagemSlack('#portal-boletos', avisos)));

console.log('\nTrilha íntegra?', await verificarTrilha());
await pool.end();
