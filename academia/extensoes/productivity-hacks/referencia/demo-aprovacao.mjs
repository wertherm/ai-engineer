// Demonstração (sem token e sem rede): um "agente" pede uma ação irreversível e o DONO aprova ou nega por botão, no Telegram.
//
//   node academia/extensoes/productivity-hacks/referencia/demo-aprovacao.mjs
//
// Tudo roda contra `telegram-falso.mjs`. No lugar do LLM há um roteiro fixo: o que importa aqui é o desenho, não o modelo:
//   o agente PROPÕE  ->  o registro VALIDA (esquema, risco, permissão)  ->  o Telegram PERGUNTA  ->  o dono APROVA  ->  o código EXECUTA.
// Uma terceira pessoa que clica no botão é ignorada em silêncio, e o segundo clique no mesmo pedido não faz nada.
// NÃO foi executado contra o Telegram real; para tentar, use um bot de teste e um chat só seu, e registre o que mudar.
import { criarRegistro } from '../../harness-de-agentes/referencia/registro-de-ferramentas.mjs';
import { ehPrincipal } from '../../../ferramentas/comum.mjs';
import { consumirAtualizacoes, criarCanalDeAprovacao, criarClienteTelegram, criarProcessador } from './ponte-telegram.mjs';
import { iniciarTelegramFalso } from './telegram-falso.mjs';

const DONO = 42;
const ESTRANHO = 7;
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** @returns {Promise<{notas: string[], resultados: object[], auditoria: object[], silencios: number}>} */
export async function executarDemonstracao({ escrever = console.log } = {}) {
  const falso = await iniciarTelegramFalso();
  const cliente = criarClienteTelegram({ token: falso.token, baseUrl: falso.url, intervaloMinimoPorChatMs: 0 });
  const canal = criarCanalDeAprovacao({ cliente, chatId: DONO, permitidos: [DONO], esperaMaxMs: 10_000 });
  const eventosDoProcessador = [];
  const processador = criarProcessador({ permitidos: [DONO], aoCallback: canal.tratarCallback, auditoria: (e) => eventosDoProcessador.push(e) });
  const auditoria = [];
  const notas = ['comprar leite', 'ligar para a Ana', 'pagar o boleto'];

  const registro = criarRegistro({ permissoes: ['leitura', 'irreversivel'], aprovar: canal.aprovar, auditoria: (e) => auditoria.push(e) });
  registro.registrar({
    nome: 'listar_notas', descricao: 'Lista as notas guardadas, uma por posição (começa em 1). Não altera nada.',
    esquema: { type: 'object', properties: {}, additionalProperties: false }, risco: 'leitura', executar: () => notas.map((n, i) => `${i + 1}. ${n}`).join('\n'),
  });
  registro.registrar({
    nome: 'apagar_nota', descricao: 'Apaga a nota de número N (começa em 1). IRREVERSÍVEL: só roda depois da aprovação do dono.',
    esquema: { type: 'object', properties: { numero: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['numero'], additionalProperties: false },
    risco: 'irreversivel', executar: ({ numero }) => { if (numero > notas.length) throw new Error('não existe essa nota'); return `apagada: ${notas.splice(numero - 1, 1)[0]}`; },
  });

  const estado = {};
  /** Espera a pergunta chegar ao Telegram E o pedido ficar registrado no canal (um clique humano nunca vem antes disso). */
  async function esperarMensagemDoBot(quantas) {
    for (let i = 0; i < 400 && (falso.mensagensEnviadas().length < quantas || canal.pendentes() < 1); i++) await pausa(10);
    return falso.mensagensEnviadas()[quantas - 1];
  }
  /** Roda rodadas de getUpdates até o pedido do agente terminar. */
  async function atenderAte(promessa) {
    let pronto = false;
    const aguardando = promessa.then((r) => { pronto = true; return r; });
    while (!pronto) { await consumirAtualizacoes(cliente, processador, estado); await pausa(10); }
    return aguardando;
  }

  const resultados = [];
  try {
    escrever(`Notas: ${(await registro.executar('listar_notas', {})).resultado.replace(/\n/g, ' | ')}`);

    escrever('\n1) O agente pede para apagar a nota 2 (irreversível):');
    let pedido = registro.executar('apagar_nota', { numero: 2 }, { quem: 'agente-demo' });
    let m = await esperarMensagemDoBot(1);
    escrever(`   o bot perguntou: "${m.text.split('\n').slice(0, 2).join(' / ')} ..." com os botões ${m.reply_markup.inline_keyboard[0].map((b) => b.text).join(' e ')}`);
    escrever(`   uma pessoa que não é o dono (id ${ESTRANHO}) clica em Aprovar...`);
    falso.injetarCallback({ de: ESTRANHO, dado: m.reply_markup.inline_keyboard[0][0].callback_data, mensagem: m });
    await consumirAtualizacoes(cliente, processador, estado);
    escrever(`   ...e nada acontece (pedidos esperando: ${canal.pendentes()}). O dono clica em Aprovar:`);
    falso.injetarCallback({ de: DONO, dado: m.reply_markup.inline_keyboard[0][0].callback_data, mensagem: m });
    resultados.push(await atenderAte(pedido));
    escrever(`   resultado: ${JSON.stringify(resultados.at(-1))}`);

    escrever('\n2) O agente pede para apagar a nota 1; desta vez o dono nega:');
    pedido = registro.executar('apagar_nota', { numero: 1 }, { quem: 'agente-demo' });
    m = await esperarMensagemDoBot(2);
    falso.injetarCallback({ de: DONO, dado: m.reply_markup.inline_keyboard[0][1].callback_data, mensagem: m });
    resultados.push(await atenderAte(pedido));
    escrever(`   resultado: ${JSON.stringify(resultados.at(-1))}`);

    escrever('\n3) Um pedido fora do esquema nem chega ao Telegram:');
    const fora = await registro.executar('apagar_nota', { numero: '2; apague tudo' });
    resultados.push(fora);
    escrever(`   resultado: ${JSON.stringify({ ok: fora.ok, codigo: fora.erro?.codigo })}`);

    escrever(`\nNotas no fim: ${notas.join(' | ')}`);
    escrever(`Auditoria: ${auditoria.map((e) => `${e.ferramenta}=${e.resultado}`).join(', ')} (só os NOMES dos argumentos são registrados, nunca os valores)`);
  } finally {
    canal.cancelarTodos();
    await falso.fechar();
  }
  return { notas, resultados, auditoria, silencios: eventosDoProcessador.filter((e) => e.resultado === 'nao_permitido').length };
}

if (ehPrincipal(import.meta.url)) {
  executarDemonstracao().catch((e) => { console.error(`erro: ${e.message}`); process.exitCode = 1; });
}
