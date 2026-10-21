// Demonstração (sem token e sem rede): o DONO pede uma ação irreversível pelo Telegram e aprova ou nega por botão.
//
//   node academia/extensoes/productivity-hacks/referencia/demo-aprovacao.mjs
//
// Tudo roda contra `telegram-falso.mjs`. No lugar do LLM há um roteiro fixo (o comando `/apagar N`): o que importa aqui é o desenho:
//   mensagem do dono -> o "agente" PROPÕE -> o registro VALIDA (esquema, risco, permissão) -> o Telegram PERGUNTA ->
//   o dono APROVA -> o código EXECUTA.
// É o caminho natural, em que o tratador da mensagem fica esperando o clique de aprovação, que chega como outro update: por isso o laço
// (`consumirAtualizacoes`) não espera os tratadores de mensagem. Uma terceira pessoa que clica no botão é ignorada em silêncio, e o
// segundo clique no mesmo pedido não faz nada.
// NÃO foi executado contra o Telegram real; para tentar, use um bot de teste e um chat só seu, e registre o que mudar.
import { criarRegistro } from '../../harness-de-agentes/referencia/registro-de-ferramentas.mjs';
import { ehPrincipal } from '../../../ferramentas/comum.mjs';
import { aguardarTratadores, consumirAtualizacoes, criarCanalDeAprovacao, criarClienteTelegram, criarProcessador } from './ponte-telegram.mjs';
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
  const auditoria = [];
  const resultados = [];
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

  const processador = criarProcessador({
    permitidos: [DONO],
    aoCallback: canal.tratarCallback,
    auditoria: (e) => eventosDoProcessador.push(e),
    aoMensagem: async (e) => {
      if (e.comando !== 'apagar') return;
      // o "agente" (aqui, um roteiro) propõe; o registro valida e pede a aprovação; o tratador ESPERA o clique
      const r = await registro.executar('apagar_nota', { numero: Number(e.argumentos) }, { quem: 'agente-demo' });
      resultados.push(r);
      await cliente.enviarTexto(e.chat.id, r.ok ? `feito: ${r.resultado}` : `não feito: ${r.erro.codigo}`);
    },
  });

  // o laço de long polling roda em segundo plano, como num bot de verdade
  const estado = {};
  let parar = false;
  const laco = (async () => { while (!parar) { await consumirAtualizacoes(cliente, processador, estado); await pausa(10); } })();
  const esperarAte = async (cond, ms = 5000) => { for (let i = 0; i < ms / 10 && !cond(); i++) await pausa(10); if (!cond()) throw new Error('a demonstração não chegou ao estado esperado'); };
  const perguntaAberta = () => falso.mensagensEnviadas().filter((m) => m.text.startsWith('Aprovar esta ação?') && m.reply_markup?.inline_keyboard?.length).at(-1);
  const resposta = (n) => falso.mensagensEnviadas().filter((m) => !m.text.startsWith('Aprovar esta ação?'))[n]?.text;

  try {
    escrever(`Notas: ${(await registro.executar('listar_notas', {})).resultado.replace(/\n/g, ' | ')}`);

    escrever('\n1) O dono escreve "/apagar 2" no Telegram:');
    falso.injetarMensagem({ de: DONO, texto: '/apagar 2' });
    await esperarAte(() => perguntaAberta() && canal.pendentes() === 1);
    let pergunta = perguntaAberta();
    escrever(`   o bot perguntou: "${pergunta.text.split('\n').slice(0, 2).join(' / ')} ..." com os botões ${pergunta.reply_markup.inline_keyboard[0].map((b) => b.text).join(' e ')}`);
    escrever(`   uma pessoa que não é o dono (id ${ESTRANHO}) clica em Aprovar...`);
    falso.injetarCallback({ de: ESTRANHO, dado: pergunta.reply_markup.inline_keyboard[0][0].callback_data, mensagem: pergunta });
    await esperarAte(() => eventosDoProcessador.some((e) => e.resultado === 'nao_permitido'));
    escrever(`   ...e nada acontece (pedidos esperando: ${canal.pendentes()}). O dono clica em Aprovar:`);
    falso.injetarCallback({ de: DONO, dado: pergunta.reply_markup.inline_keyboard[0][0].callback_data, mensagem: pergunta });
    await esperarAte(() => resposta(0));
    escrever(`   resposta do bot: ${resposta(0)}`);

    escrever('\n2) O dono escreve "/apagar 1"; desta vez nega:');
    falso.injetarMensagem({ de: DONO, texto: '/apagar 1' });
    await esperarAte(() => perguntaAberta() && canal.pendentes() === 1);
    pergunta = perguntaAberta();
    falso.injetarCallback({ de: DONO, dado: pergunta.reply_markup.inline_keyboard[0][1].callback_data, mensagem: pergunta });
    await esperarAte(() => resposta(1));
    escrever(`   resposta do bot: ${resposta(1)}`);

    escrever('\n3) Um pedido fora do esquema ("/apagar dois") nem chega a perguntar:');
    falso.injetarMensagem({ de: DONO, texto: '/apagar dois' });
    await esperarAte(() => resposta(2));
    escrever(`   resposta do bot: ${resposta(2)}`);

    escrever(`\nNotas no fim: ${notas.join(' | ')}`);
    escrever(`Auditoria do registro: ${auditoria.map((e) => `${e.ferramenta}=${e.resultado}`).join(', ')} (só os NOMES dos argumentos são registrados, nunca os valores)`);
  } finally {
    parar = true;
    canal.cancelarTodos();
    await laco;
    await aguardarTratadores(estado);
    await falso.fechar();
  }
  return { notas, resultados, auditoria, silencios: eventosDoProcessador.filter((e) => e.resultado === 'nao_permitido').length };
}

if (ehPrincipal(import.meta.url)) {
  executarDemonstracao().catch((e) => { console.error(`erro: ${e.message}`); process.exitCode = 1; });
}
