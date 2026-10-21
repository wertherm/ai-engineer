// Ponte entre um assistente e o Telegram: cliente da Bot API, processador de atualizações e canal de aprovação por botões.
// Sem dependências (Node 22+). Serve aos hacks PH-TEL-03, PH-TEL-04 e PH-TEL-05 e aos projetos PP-01, PP-02, PP-03 e PP-05.
//
// Três peças pequenas, de propósito:
//   1. `criarClienteTelegram`  fala com a Bot API: divide texto em pedaços de até 4096 caracteres, escapa HTML, respeita o intervalo
//      por chat, repete só o que vale repetir (429 com `retry_after`, 5xx, rede) e faz o possível para o token não aparecer em
//      erro ou log (mascara o token conhecido, a forma codificada e qualquer coisa com cara de token de bot; não é garantia: o
//      código que USA o cliente também precisa cuidar do que escreve em log).
//   2. `criarProcessador`      decide quem pode falar com o bot (lista de IDs numéricos, sempre) e ignora updates repetidos (`update_id`).
//   3. `criarCanalDeAprovacao` pergunta "posso?" por botão e devolve true/false: encaixa em `aprovar` do registro de ferramentas do
//      harness (../../harness-de-agentes/referencia/registro-de-ferramentas.mjs), que decide o que exige aprovação e audita.
//
// O LLM propõe, o CÓDIGO valida e executa, o HUMANO aprova o que tem efeito externo. Nada aqui chama um LLM.
//
// ARMADILHA DO LAÇO (já reproduzida em revisão): se o tratador de uma mensagem ESPERA a aprovação ("mensagem do dono -> agente ->
// registro.executar -> aprovar"), e o laço que busca updates esperasse esse tratador, o clique de aprovação (outro update) nunca seria
// entregue. Por isso `consumirAtualizacoes` NÃO espera os tratadores de mensagem (roda cada um em segundo plano, em ordem por chat)
// e entrega os cliques na hora. Use `aguardarTratadores(estado)` ao encerrar o programa e nos testes.
//
// Limites que continuam valendo: NÃO foi executado contra o Telegram real (só contra `telegram-falso.mjs`); as regras vêm da
// documentação oficial lida em 2026-10-21 (https://core.telegram.org/bots/api e /bots/faq), que muda com frequência. Chats com bots
// não têm criptografia de ponta a ponta: o que você manda ao bot, o servidor do bot lê em claro. Não mande segredos por ele.
import { randomBytes } from 'node:crypto';
import { mascararSegredos, paraTerminal } from '../../../ferramentas/comum.mjs';

export const LIMITE_TEXTO = 4096;
export const LIMITE_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const FORMATO_DA_CREDENCIAL = /^\d{3,20}:[A-Za-z0-9_-]{10,}$/;
const MAX_TIMER_MS = 86_400_000; // 24 h (setTimeout estoura acima de 2^31-1 ms e dispara na hora)

/** Erro com tipo estável (como na Lição 2): rede, timeout, limite_de_taxa, servidor (repetíveis); autenticacao, requisicao_invalida, resposta_invalida, arquivo_grande (não). */
export class ErroTelegram extends Error {
  constructor(tipo, mensagem, { repetivel = false, status = null, codigo = null, retryAfterS = null } = {}) {
    super(mensagem);
    this.name = 'ErroTelegram';
    this.tipo = tipo;
    this.repetivel = repetivel;
    this.status = status;
    this.codigo = codigo;
    this.retryAfterS = retryAfterS;
  }
}

/**
 * Troca o token (a forma crua e a codificada) e qualquer coisa com cara de token de bot ou de segredo por ***.
 * Mascare ANTES de truncar: cortar primeiro deixa um pedaço do token à mostra.
 */
export function mascararToken(texto, token) {
  let t = String(texto);
  if (token) {
    const codificado = encodeURIComponent(token);
    for (const forma of new Set([token, codificado, codificado.replace(/%3A/g, '%3a')])) t = t.split(forma).join('***');
  }
  t = t.replace(/\/bot\d{3,20}(?::|%3[Aa])[A-Za-z0-9_-]{3,}/g, '/bot***').replace(/(?<![A-Za-z0-9])\d{6,20}(?::|%3[Aa])[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g, '***');
  return mascararSegredos(t);
}

/** Escapa o que o Telegram trata como marcação no modo HTML (`<`, `>` e `&`). */
export const escaparHtml = (texto) => String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Divide um texto em pedaços de no máximo `limite` caracteres, preferindo cortar numa quebra de linha e depois num espaço; só corta no
 * meio de uma palavra se não houver alternativa, e nunca no meio de um par substituto (emoji). Pedaços só de espaço são descartados.
 */
export function dividirTexto(texto, limite = LIMITE_TEXTO) {
  if (!Number.isInteger(limite) || limite < 2) throw new RangeError('limite deve ser um inteiro de 2 ou mais');
  let resto = String(texto);
  const partes = [];
  while (resto.length > limite) {
    let corte = resto.lastIndexOf('\n', limite);
    let separador = 1;
    if (corte < limite / 2) {
      corte = resto.lastIndexOf(' ', limite);
      if (corte < limite / 2) {
        corte = limite;
        separador = 0;
        const unidade = resto.charCodeAt(corte - 1);
        if (unidade >= 0xd800 && unidade <= 0xdbff) corte -= 1; // não separa um par substituto
      }
    }
    const parte = resto.slice(0, corte);
    if (parte.trim() !== '') partes.push(parte);
    resto = resto.slice(corte + separador);
  }
  if (resto.trim() !== '') partes.push(resto);
  return partes;
}

/** IDs numéricos do Telegram. `positivos`: IDs de usuário são positivos (IDs de grupo e canal são negativos e entram em `permitidosChats`). */
function idsNumericos(nome, lista, { positivos = false } = {}) {
  if (lista === undefined || lista === null || typeof lista[Symbol.iterator] !== 'function' || typeof lista === 'string') throw new TypeError(`${nome} deve ser uma lista de IDs numéricos do Telegram`);
  const ids = new Set();
  for (const bruto of lista) {
    const n = typeof bruto === 'string' && /^-?\d{1,18}$/.test(bruto.trim()) ? Number(bruto.trim()) : bruto;
    if (!Number.isSafeInteger(n) || n === 0 || (positivos && n < 0)) throw new TypeError(`${nome} só aceita IDs numéricos ${positivos ? 'positivos' : 'diferentes de zero'} (use o ID, não o @usuario, que pode mudar): valor inválido na posição ${ids.size + 1}`);
    ids.add(n);
  }
  return ids;
}

/**
 * Cliente da Bot API.
 * @param {object} p
 * @param {string} p.token do BotFather, vindo do ambiente (nunca do código, de um prompt ou de um chat)
 * @param {string} [p.baseUrl] https://api.telegram.org por padrão; `http` só em localhost (o token viaja na URL)
 * @param {number} [p.prazoTotalMs] teto de tempo gasto em esperas de repetição de UMA chamada (padrão 120 s)
 */
export function criarClienteTelegram({
  token, baseUrl = 'https://api.telegram.org', fetchImpl = globalThis.fetch, agora = Date.now,
  esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)), aleatorio = Math.random,
  intervaloMinimoPorChatMs = 1000, maxTentativas = 3, esperaMaximaS = 60, timeoutMs = 30_000, backoffBaseMs = 500, backoffTetoMs = 8000, prazoTotalMs = 120_000,
} = {}) {
  if (typeof token !== 'string' || !FORMATO_DA_CREDENCIAL.test(token)) throw new TypeError('token ausente ou fora do formato <números>:<texto> (o valor não é mostrado)');
  let base;
  try { base = new URL(baseUrl); } catch { throw new TypeError('baseUrl inválida'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) throw new TypeError('baseUrl deve ser https (http só em localhost): o token vai na URL');
  if (base.pathname !== '/' || base.search || base.hash) throw new TypeError('baseUrl deve ser só o endereço do servidor, sem caminho (o caminho seria ignorado)');
  if (!Number.isInteger(maxTentativas) || maxTentativas < 1 || maxTentativas > 10) throw new RangeError('maxTentativas deve ser um inteiro de 1 a 10');
  const raiz = base.origin;
  const ultimoEnvio = new Map();
  const mascarar = (t) => mascararToken(t, token);

  function classificar(status, corpo) {
    const codigo = Number.isInteger(corpo?.error_code) ? corpo.error_code : status;
    const descricao = mascarar(paraTerminal(String(corpo?.description ?? ''))).slice(0, 300); // mascara ANTES de cortar
    if (codigo === 401) return new ErroTelegram('autenticacao', 'o Telegram recusou a credencial (token errado ou revogado)', { status, codigo });
    if (codigo === 429) {
      const bruto = corpo?.parameters?.retry_after;
      const retryAfterS = Number.isFinite(bruto) && bruto >= 0 ? bruto : 1;
      return new ErroTelegram('limite_de_taxa', `limite de taxa: o Telegram pediu espera de ${retryAfterS} s`, { repetivel: retryAfterS <= esperaMaximaS, status, codigo, retryAfterS });
    }
    if (codigo >= 500) return new ErroTelegram('servidor', `erro do servidor do Telegram (${codigo})`, { repetivel: true, status, codigo });
    if ([400, 403, 404, 409].includes(codigo)) return new ErroTelegram('requisicao_invalida', `o Telegram recusou o pedido (${codigo}): ${descricao}`, { status, codigo });
    return new ErroTelegram('resposta_invalida', `resposta inesperada do Telegram (${codigo})`, { status, codigo });
  }

  async function umaChamada(metodo, params, tempoMs) {
    let resp;
    let texto;
    try {
      resp = await fetchImpl(`${raiz}/bot${token}/${metodo}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params),
        signal: AbortSignal.timeout(tempoMs), redirect: 'error',
      });
      texto = await resp.text();
    } catch (e) {
      const tempo = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      // a mensagem original pode conter a URL (com o token): não é repassada
      throw new ErroTelegram(tempo ? 'timeout' : 'rede', tempo ? 'tempo esgotado ao falar com o Telegram' : 'falha de rede ao falar com o Telegram', { repetivel: true });
    }
    let corpo;
    try { corpo = JSON.parse(texto); } catch { corpo = null; }
    if (corpo?.ok === true) return corpo.result;
    if (corpo === null) throw resp.status >= 500 ? new ErroTelegram('servidor', `erro do servidor do Telegram (${resp.status})`, { repetivel: true, status: resp.status }) : new ErroTelegram('resposta_invalida', `a resposta do Telegram não é JSON (${resp.status})`, { status: resp.status });
    throw classificar(resp.status, corpo);
  }

  /** Chama um método da Bot API e devolve `result`. Repete 429 (esperando `retry_after`), 5xx, rede e timeout, até `maxTentativas` e `prazoTotalMs`. */
  async function chamar(metodo, params = {}, { timeoutMs: tempoMs = timeoutMs } = {}) {
    if (!/^[A-Za-z]{3,40}$/.test(metodo)) throw new TypeError('nome de método inválido');
    const inicio = agora();
    for (let n = 1; ; n++) {
      try {
        return await umaChamada(metodo, params, tempoMs);
      } catch (e) {
        if (!(e instanceof ErroTelegram) || !e.repetivel || n >= maxTentativas) throw e;
        const espera = e.tipo === 'limite_de_taxa' ? e.retryAfterS * 1000 : Math.floor(aleatorio() * Math.min(backoffTetoMs, backoffBaseMs * 2 ** (n - 1)));
        if (agora() - inicio + espera > prazoTotalMs) throw e; // não fica preso por minutos
        await esperar(espera);
      }
    }
  }

  async function respeitarIntervalo(chatId) {
    const ultimo = ultimoEnvio.get(String(chatId));
    if (ultimo === undefined) return;
    const falta = intervaloMinimoPorChatMs - (agora() - ultimo);
    if (falta > 0) await esperar(falta);
  }

  /**
   * Envia texto (dividido se passar de 4096 caracteres). Com `html`, o texto é ESCAPADO e enviado como HTML (só serve para não quebrar
   * em `<`, `>` e `&`: não há formatação); o `replyMarkup` vai só no último pedaço. Por padrão a pré-visualização de links fica
   * desligada (`link_preview_options`, parâmetro da Bot API 7.0 em diante, não conferido na pesquisa de 2026-10-21): o servidor do
   * Telegram não busca um endereço que veio de um texto não confiável. Um envio repetido por 5xx ou rede pode duplicar a mensagem.
   */
  async function enviarTexto(chatId, texto, { html = false, replyMarkup, semPreviaDeLinks = true } = {}) {
    if (typeof texto !== 'string') throw new TypeError('o texto deve ser uma string');
    const partes = dividirTexto(texto);
    if (partes.length === 0) throw new RangeError('o texto está vazio: o Telegram recusa mensagem sem texto');
    const enviadas = [];
    for (let i = 0; i < partes.length; i++) {
      await respeitarIntervalo(chatId);
      const params = { chat_id: chatId, text: html ? escaparHtml(partes[i]) : partes[i] };
      if (html) params.parse_mode = 'HTML';
      if (semPreviaDeLinks) params.link_preview_options = { is_disabled: true };
      if (replyMarkup && i === partes.length - 1) params.reply_markup = replyMarkup;
      enviadas.push(await chamar('sendMessage', params));
      ultimoEnvio.set(String(chatId), agora());
    }
    return enviadas;
  }

  const obterAtualizacoes = ({ offset, timeoutS = 0, limit = 100, allowedUpdates } = {}) => chamar(
    'getUpdates',
    { ...(offset !== undefined ? { offset } : {}), timeout: timeoutS, limit, ...(allowedUpdates ? { allowed_updates: allowedUpdates } : {}) },
    { timeoutMs: timeoutS * 1000 + timeoutMs },
  );
  const responderCallback = (callbackQueryId, texto) => chamar('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(texto ? { text: texto } : {}) });
  const editarTexto = (chatId, messageId, texto, { replyMarkup } = {}) => chamar('editMessageText', { chat_id: chatId, message_id: messageId, text: texto, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });

  /** Baixa um arquivo recebido (áudio, foto...). Recusa antes de baixar o que passa de `maxBytes` (o limite do Telegram é 20 MB). Uma tentativa só. */
  async function baixarArquivo(fileId, { maxBytes = LIMITE_DOWNLOAD_BYTES } = {}) {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new RangeError('maxBytes deve ser um número positivo');
    const info = await chamar('getFile', { file_id: fileId });
    if (typeof info?.file_size === 'number' && info.file_size > maxBytes) throw new ErroTelegram('arquivo_grande', `o arquivo tem ${info.file_size} bytes e o limite é ${maxBytes}`);
    const caminho = info?.file_path;
    if (typeof caminho !== 'string' || caminho === '' || caminho.startsWith('/') || caminho.split('/').includes('..')) throw new ErroTelegram('resposta_invalida', 'o Telegram devolveu um caminho de arquivo inesperado');
    let url;
    try { url = `${raiz}/file/bot${token}/${caminho.split('/').map(encodeURIComponent).join('/')}`; } catch { throw new ErroTelegram('resposta_invalida', 'o Telegram devolveu um caminho de arquivo inesperado'); }
    let resp;
    try {
      resp = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    } catch {
      throw new ErroTelegram('rede', 'falha de rede ao baixar o arquivo', { repetivel: true });
    }
    if (!resp.ok) throw new ErroTelegram(resp.status === 401 ? 'autenticacao' : resp.status >= 500 ? 'servidor' : 'requisicao_invalida', `o download falhou (${resp.status})`, { repetivel: resp.status >= 500, status: resp.status });
    if (!resp.body) throw new ErroTelegram('resposta_invalida', 'o download veio sem corpo');
    const leitor = resp.body.getReader();
    const blocos = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) { await leitor.cancel(); throw new ErroTelegram('arquivo_grande', `o arquivo passa do limite de ${maxBytes} bytes`); }
        blocos.push(value);
      }
    } catch (e) {
      if (e instanceof ErroTelegram) throw e;
      throw new ErroTelegram('rede', 'falha de rede ao baixar o arquivo', { repetivel: true });
    }
    return Buffer.concat(blocos);
  }

  return { chamar, enviarTexto, obterAtualizacoes, responderCallback, editarTexto, baixarArquivo, mascarar };
}

/** Memória dos `update_id` já vistos (só na memória: depois de reiniciar, use um armazenamento durável com a mesma interface). */
export function criarVistos({ max = 10_000 } = {}) {
  if (!Number.isInteger(max) || max < 1) throw new RangeError('max deve ser um inteiro positivo');
  const conjunto = new Set();
  const ordem = [];
  return {
    jaVisto: (id) => conjunto.has(id),
    marcar(id) {
      if (conjunto.has(id)) return;
      conjunto.add(id);
      ordem.push(id);
      if (ordem.length > max) conjunto.delete(ordem.shift());
    },
    tamanho: () => conjunto.size,
  };
}

const COMANDO = /^\/([A-Za-z0-9_]{1,64})(?:@([A-Za-z0-9_]{1,64}))?(?:\s+([\s\S]*))?$/;
const COMANDO_VALIDO = /^[a-z0-9_]{1,32}$/;

/**
 * Processador de atualizações. Regras, nesta ordem, para CADA update (`triar`, síncrono):
 *   1. formato (precisa de `update_id` inteiro; um update com `message` E `callback_query` ao mesmo tempo é recusado);
 *   2. repetido? (mesmo `update_id` já visto) ignora, porque o Telegram pode entregar de novo o que não foi confirmado;
 *   3. quem enviou está na lista de IDs numéricos? Se não, silêncio total (nenhuma resposta, nem para dizer que o bot existe) e um
 *      registro SEM o conteúdo;
 *   4. só então o seu código roda (`executar`: `aoMensagem` / `aoCallback`).
 * O `update_id` é marcado como visto ANTES de rodar o seu código: no máximo uma execução por update (se o seu código falhar no meio,
 * o update não volta). Se preferir "pelo menos uma vez", faça o seu efeito idempotente e marque depois.
 * `processar(update)` faz triar + executar e devolve o resultado final (útil em testes); o laço de `consumirAtualizacoes` usa os dois passos.
 * Na auditoria entra só o que não é conteúdo (id do update, quem, tipo, resultado); o evento `erro` leva um trecho da mensagem de erro
 * do SEU código, já mascarado: não ponha texto de usuário em mensagens de erro.
 */
export function criarProcessador({
  permitidos, permitidosChats, aoMensagem, aoCallback, vistos = criarVistos(), auditoria = () => {}, usernameDoBot,
  mascarar = (t) => mascararToken(t), agora = () => new Date().toISOString(),
} = {}) {
  const ids = idsNumericos('permitidos', permitidos, { positivos: true });
  if (ids.size === 0) throw new Error('permitidos está vazio: um bot sem lista de IDs responderia a qualquer pessoa');
  const chats = permitidosChats === undefined ? null : idsNumericos('permitidosChats', permitidosChats);
  const emitir = (evento) => { try { auditoria({ quando: agora(), ...evento }); } catch { /* auditoria nunca derruba o bot */ } };
  const falhou = (e) => mascarar(paraTerminal(String(e?.message ?? e))).slice(0, 200); // mascara ANTES de cortar

  function triar(update) {
    if (!update || typeof update !== 'object' || !Number.isSafeInteger(update.update_id)) { emitir({ resultado: 'invalido' }); return { resultado: 'invalido' }; }
    const updateId = update.update_id;
    if (vistos.jaVisto(updateId)) { emitir({ update_id: updateId, resultado: 'repetido' }); return { resultado: 'repetido', update_id: updateId }; }
    vistos.marcar(updateId);

    const msg = update.message;
    const cb = update.callback_query;
    if (msg && cb) { emitir({ update_id: updateId, resultado: 'invalido' }); return { resultado: 'invalido', update_id: updateId }; } // o Telegram nunca manda os dois
    const deId = (msg?.from ?? cb?.from)?.id;
    const chat = msg?.chat ?? cb?.message?.chat;
    if (!msg && !cb && Number.isSafeInteger(update.edited_message?.from?.id) && ids.has(update.edited_message.from.id)) {
      emitir({ update_id: updateId, resultado: 'tipo_ignorado', de: update.edited_message.from.id });
      return { resultado: 'tipo_ignorado', update_id: updateId };
    }
    if (!Number.isSafeInteger(deId) || !ids.has(deId) || (chats && !(Number.isSafeInteger(chat?.id) && chats.has(chat.id)))) {
      emitir({ update_id: updateId, resultado: 'nao_permitido', de: Number.isSafeInteger(deId) ? deId : null });
      return { resultado: 'nao_permitido', update_id: updateId };
    }
    const ignorar = () => { emitir({ update_id: updateId, resultado: 'tipo_ignorado', de: deId }); return { resultado: 'tipo_ignorado', update_id: updateId }; };

    if (cb) {
      if (!aoCallback) return ignorar();
      return {
        aceito: true, update_id: updateId, tipo: 'callback', chatId: chat?.id ?? deId,
        executar: async () => {
          try {
            await aoCallback({ id: cb.id, dado: typeof cb.data === 'string' ? cb.data : '', de: deId, mensagem: cb.message, update });
            emitir({ update_id: updateId, resultado: 'callback', de: deId });
            return { resultado: 'callback', update_id: updateId };
          } catch (e) {
            emitir({ update_id: updateId, resultado: 'erro', de: deId, erro: falhou(e) });
            return { resultado: 'erro', update_id: updateId };
          }
        },
      };
    }
    if (!msg || !aoMensagem) return ignorar();

    let evento;
    if (msg.voice && typeof msg.voice === 'object') evento = { tipo: 'voz', voz: msg.voice };
    else if (typeof msg.text === 'string' && msg.text.startsWith('/')) {
      const m = COMANDO.exec(msg.text);
      if (!m || !COMANDO_VALIDO.test(m[1])) { emitir({ update_id: updateId, resultado: 'comando_invalido', de: deId }); return { resultado: 'comando_invalido', update_id: updateId }; }
      if (m[2] && usernameDoBot && m[2].toLowerCase() !== String(usernameDoBot).toLowerCase()) { emitir({ update_id: updateId, resultado: 'outro_bot', de: deId }); return { resultado: 'outro_bot', update_id: updateId }; }
      evento = { tipo: 'comando', comando: m[1], argumentos: (m[3] ?? '').trim(), texto: msg.text };
    } else if (typeof msg.text === 'string') evento = { tipo: 'texto', texto: msg.text };
    else return ignorar();
    return {
      aceito: true, update_id: updateId, tipo: 'mensagem', chatId: chat?.id ?? deId,
      executar: async () => {
        try {
          await aoMensagem({ ...evento, de: deId, chat, mensagemId: msg.message_id, update });
          emitir({ update_id: updateId, resultado: 'processado', tipo: evento.tipo, de: deId });
          return { resultado: 'processado', tipo: evento.tipo, update_id: updateId };
        } catch (e) {
          emitir({ update_id: updateId, resultado: 'erro', de: deId, erro: falhou(e) });
          return { resultado: 'erro', update_id: updateId };
        }
      },
    };
  }

  /** triar + executar, esperando o seu tratador terminar. */
  async function processar(update) {
    const t = triar(update);
    return t.aceito ? t.executar() : t;
  }
  return { triar, processar };
}

/**
 * Uma rodada de long polling: busca os updates e CONFIRMA (offset = maior update_id + 1) no fim.
 *  - cliques (`callback_query`) são tratados na hora, em ordem (são curtos);
 *  - mensagens rodam em SEGUNDO PLANO, em ordem por chat, e entram nos resultados como `{resultado: 'iniciado', concluido: Promise}`:
 *    assim um tratador que espera uma aprovação não bloqueia a entrega do clique que a decide (veja o cabeçalho do arquivo).
 * `estado` guarda o offset e os tratadores em andamento; chame de novo em laço. Por padrão só pede `message` e `callback_query`.
 * Atenção (não verificado na pesquisa): depois de uma semana sem updates, a documentação diz que o próximo `update_id` é escolhido
 * aleatoriamente; se o seu bot ficar parado tanto tempo, comece de novo sem `estado.offset`.
 */
export async function consumirAtualizacoes(cliente, processador, estado = {}, { timeoutS = 0, allowedUpdates = ['message', 'callback_query'] } = {}) {
  const updates = await cliente.obterAtualizacoes({ offset: estado.offset, timeoutS, allowedUpdates });
  estado.cadeias ??= new Map();
  estado.emAndamento ??= new Set();
  const resultados = [];
  for (const u of updates) {
    const t = processador.triar(u);
    if (!t.aceito) { resultados.push(t); continue; }
    if (t.tipo === 'callback') { resultados.push(await t.executar()); continue; }
    const chave = String(t.chatId);
    const concluido = (estado.cadeias.get(chave) ?? Promise.resolve()).then(() => t.executar());
    const marcador = concluido.then(() => {}, () => {});
    estado.cadeias.set(chave, marcador);
    estado.emAndamento.add(marcador);
    marcador.then(() => {
      estado.emAndamento.delete(marcador);
      if (estado.cadeias.get(chave) === marcador) estado.cadeias.delete(chave);
    });
    resultados.push({ resultado: 'iniciado', update_id: t.update_id, tipo: 'mensagem', concluido });
  }
  const ids = updates.map((u) => u?.update_id).filter(Number.isSafeInteger);
  if (ids.length) estado.offset = Math.max(...ids) + 1;
  return resultados;
}

/** Espera os tratadores de mensagem que `consumirAtualizacoes` deixou em andamento (ao encerrar o programa e nos testes). */
export async function aguardarTratadores(estado) {
  while (estado?.emAndamento?.size) await Promise.allSettled([...estado.emAndamento]);
}

/**
 * Canal de aprovação por botões. `aprovar(info)` envia "Aprovar / Negar" ao SEU chat e só resolve `true` com o clique de um ID permitido;
 * qualquer outra coisa (negar, expirar, falha ao enviar, parâmetros grandes demais para revisar, fila cheia) resolve `false`. O
 * `callback_data` leva só um id curto e aleatório, nunca a ação. Cada pedido vale uma vez: o segundo clique recebe "já respondido".
 * O texto mostra os parâmetros COMPLETOS (de `info.argumentos`, não do resumo cortado pelo registro); se não couberem em
 * `maxParametrosChars`, o pedido é NEGADO e você é avisado: aprovar o que não se vê é carimbo.
 * Encaixa em `criarRegistro({ aprovar: canal.aprovar })`. Cada decisão vai para `auditoria` (quem decidiu, quando, o quê; nunca os valores).
 */
export function criarCanalDeAprovacao({
  cliente, chatId, permitidos, esperaMaxMs = 120_000, novoId = () => randomBytes(6).toString('hex'),
  maxPendentes = 5, maxParametrosChars = 2500, auditoria = () => {}, agora = () => new Date().toISOString(),
} = {}) {
  if (!cliente || ['chamar', 'editarTexto', 'responderCallback'].some((m) => typeof cliente[m] !== 'function')) throw new TypeError('cliente precisa ter chamar, editarTexto e responderCallback');
  if (!Number.isSafeInteger(chatId)) throw new TypeError('chatId deve ser o ID numérico do chat');
  const ids = idsNumericos('permitidos', permitidos, { positivos: true });
  if (ids.size === 0) throw new Error('permitidos está vazio');
  if (!Number.isFinite(esperaMaxMs) || esperaMaxMs < 1 || esperaMaxMs > MAX_TIMER_MS) throw new RangeError(`esperaMaxMs deve estar entre 1 e ${MAX_TIMER_MS}`);
  if (!Number.isInteger(maxPendentes) || maxPendentes < 1) throw new RangeError('maxPendentes deve ser um inteiro positivo');
  if (!Number.isInteger(maxParametrosChars) || maxParametrosChars < 50 || maxParametrosChars > 3000) throw new RangeError('maxParametrosChars deve estar entre 50 e 3000');
  const pendentes = new Map();
  const mostrar = (t, max) => mascararToken(paraTerminal(String(t ?? ''))).slice(0, max); // mascara ANTES de cortar
  const registrar = (evento) => { try { auditoria({ quando: agora(), ...evento }); } catch { /* nunca derruba */ } };

  function fechar(id, aprovado, rotulo, decisao, de) {
    const p = pendentes.get(id);
    if (!p) return false;
    pendentes.delete(id);
    clearTimeout(p.timer);
    p.resolver(aprovado);
    registrar({ id, ferramenta: p.ferramenta, decisao, ...(de !== undefined ? { de } : {}) });
    cliente.editarTexto(p.chatId, p.messageId, `${p.texto}\n\n${rotulo}`, { replyMarkup: { inline_keyboard: [] } }).catch(() => {});
    return true;
  }

  async function aprovar(info = {}) {
    const ferramenta = mostrar(info.ferramenta, 60);
    if (pendentes.size >= maxPendentes) { registrar({ ferramenta, decisao: 'recusado_fila_cheia' }); return false; }
    let completo;
    try { completo = info.argumentos !== undefined ? JSON.stringify(info.argumentos) : String(info.resumo ?? ''); } catch { completo = '[argumentos não exibíveis]'; }
    const parametros = mostrar(completo, Number.MAX_SAFE_INTEGER);
    if (parametros.length > maxParametrosChars) {
      registrar({ ferramenta, decisao: 'recusado_parametros_grandes' });
      cliente.chamar('sendMessage', { chat_id: chatId, text: `Pedido NEGADO sem perguntar: ${ferramenta} chegou com ${parametros.length} caracteres de parâmetros, mais do que cabe para você revisar (${maxParametrosChars}). Aprovar o que não se vê é carimbo.` }).catch(() => {});
      return false;
    }
    const id = novoId();
    if (!/^[0-9a-f]{12}$/.test(id)) throw new Error('novoId deve devolver 12 caracteres hexadecimais');
    if (pendentes.has(id)) throw new Error('novoId repetiu um id que ainda espera resposta');
    const texto = ['Aprovar esta ação?', `Ferramenta: ${ferramenta}`, `Risco: ${mostrar(info.risco, 20)}`, `Pedida por: ${mostrar(info.quem, 64)}`, `Parâmetros: ${parametros}`].join('\n');
    let enviada;
    try {
      enviada = await cliente.chamar('sendMessage', { chat_id: chatId, text: texto, reply_markup: { inline_keyboard: [[{ text: 'Aprovar', callback_data: `ok:${id}` }, { text: 'Negar', callback_data: `no:${id}` }]] } });
    } catch {
      registrar({ ferramenta, decisao: 'recusado_falha_ao_enviar' });
      return false;
    }
    return new Promise((resolver) => {
      const timer = setTimeout(() => fechar(id, false, 'Expirou sem resposta: negado', 'expirado'), esperaMaxMs);
      timer.unref?.();
      pendentes.set(id, { resolver, timer, messageId: enviada.message_id, chatId: enviada.chat?.id ?? chatId, texto, ferramenta });
    });
  }

  /** Trate aqui os `callback_query` (o processador já os entrega, depois de conferir o ID). */
  async function tratarCallback({ id: callbackId, dado, de, mensagem } = {}) {
    const responder = (t) => cliente.responderCallback(callbackId, t).catch(() => {});
    if (!Number.isSafeInteger(de) || !ids.has(de)) { await responder(); return { resultado: 'nao_permitido' }; }
    const m = /^(ok|no):([0-9a-f]{12})$/.exec(String(dado ?? ''));
    if (!m) { await responder('Botão desconhecido'); return { resultado: 'desconhecido' }; }
    const p = pendentes.get(m[2]);
    if (!p || p.messageId !== mensagem?.message_id || String(p.chatId) !== String(mensagem?.chat?.id)) { await responder('Pedido expirado ou já respondido'); return { resultado: 'expirado' }; }
    const aprovado = m[1] === 'ok';
    fechar(m[2], aprovado, aprovado ? 'Aprovado' : 'Negado', aprovado ? 'aprovado' : 'negado', de);
    await responder(aprovado ? 'Aprovado' : 'Negado');
    return { resultado: aprovado ? 'aprovado' : 'negado' };
  }

  /** Nega tudo que ainda espera resposta e limpa os relógios (use ao encerrar o programa). */
  function cancelarTodos() {
    for (const id of [...pendentes.keys()]) fechar(id, false, 'Cancelado: negado', 'cancelado');
  }

  return { aprovar, tratarCallback, pendentes: () => pendentes.size, cancelarTodos };
}
