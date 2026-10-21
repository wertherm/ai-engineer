// Um "Telegram falso": servidor local que imita uma PARTE SIMPLIFICADA da Bot API, para testar bots sem token real e sem rede.
// Sem dependências (Node 22+). Serve ao hack PH-TEL-06 e aos projetos PP-01, PP-02, PP-03 e PP-05.
//
// O QUE É: um simulador do contrato que a documentação oficial descreve (https://core.telegram.org/bots/api, lida em 2026-10-21):
//   chamada em /bot<token>/<método>, resposta JSON {ok, result} ou {ok:false, error_code, description, parameters?:{retry_after}},
//   getUpdates com `offset` que confirma (apaga) os updates anteriores, texto de 1 a 4096 caracteres, `callback_data` de 1 a 64 bytes,
//   `secret_token` do webhook de 1 a 256 caracteres [A-Za-z0-9_-], getFile só até 20 MB, getUpdates recusado com webhook ativo.
// O QUE NÃO É: não é o Telegram. As frases de `description` dos erros são SIMPLIFICADAS (o texto real pode diferir), a limitação de
//   taxa é configurável e mais simples, e vários métodos e campos não existem aqui. Passar nos testes com o falso NÃO prova que o bot
//   funciona no Telegram de verdade: a primeira execução real deve ser feita com um bot de teste, num chat só seu, e registrada.
import { createServer } from 'node:http';

export const CREDENCIAL_DE_TESTE = '123456:TOKEN-FALSO-DE-TESTE';
export const LIMITE_TEXTO = 4096;
export const LIMITE_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const TAGS_HTML = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'span', 'tg-spoiler', 'a', 'tg-emoji', 'tg-time', 'code', 'pre', 'blockquote']);

const erro = (codigo, descricao, parametros) => ({ ok: false, error_code: codigo, description: descricao, ...(parametros ? { parameters: parametros } : {}) });

/** HTML do Telegram: só as tags aceitas, `<`, `>` e `&` soltos precisam ser escapados. Devolve uma mensagem de erro ou null. */
function problemaDeHtml(texto) {
  for (const m of texto.matchAll(/<(\/?)([^<>\s/]*)[^<>]*>?/g)) {
    if (!TAGS_HTML.has(m[2].toLowerCase()) || !m[0].endsWith('>')) return "Bad Request: can't parse entities";
  }
  const semTags = texto.replace(/<\/?[A-Za-z-]+[^<>]*>/g, '');
  if (/[<>]/.test(semTags)) return "Bad Request: can't parse entities";
  if (/&(?!(?:amp|lt|gt|quot|#\d{1,7}|#x[0-9a-f]{1,6});)/i.test(semTags)) return "Bad Request: can't parse entities";
  return null;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"' };
function textoVisivel(texto, parseMode) {
  if (parseMode !== 'HTML') return texto;
  return texto.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot);/gi, (_m, n) => ENTIDADES[n.toLowerCase()]).replace(/&#(\d{1,7});/g, (_m, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)));
}

function problemaDeTeclado(markup) {
  if (markup === undefined || markup === null) return null;
  const linhas = markup?.inline_keyboard;
  if (!Array.isArray(linhas)) return null; // outros tipos de teclado não são simulados
  for (const linha of linhas) {
    if (!Array.isArray(linha)) return 'Bad Request: reply markup is invalid';
    for (const b of linha) {
      if (typeof b?.text !== 'string' || b.text.length === 0) return 'Bad Request: button text is empty';
      if (b.callback_data !== undefined) {
        const bytes = Buffer.byteLength(String(b.callback_data), 'utf8');
        if (bytes < 1 || bytes > 64) return 'Bad Request: BUTTON_DATA_INVALID';
      }
    }
  }
  return null;
}

/**
 * @param {object} [opcoes]
 * @param {string} [opcoes.token] token aceito (padrão: CREDENCIAL_DE_TESTE)
 * @param {number} [opcoes.porta] 0 = qualquer porta livre
 * @param {number} [opcoes.limitePorChatMs] se > 0, uma 2ª mensagem ao mesmo chat dentro desse intervalo recebe 429 com retry_after
 * @param {number} [opcoes.esperaMaxLongPollMs] teto da espera do getUpdates com `timeout` (para os testes não esperarem 50 s)
 */
export async function iniciarTelegramFalso({ token = CREDENCIAL_DE_TESTE, porta = 0, limitePorChatMs = 0, esperaMaxLongPollMs = 300 } = {}) {
  let proximoUpdate = 1000;
  let proximaMensagem = 1;
  let proximoCallback = 1;
  const fila = []; // updates ainda não confirmados
  const log = []; // {metodo, params, quando}
  const mensagens = new Map(); // `${chat}:${id}` -> mensagem
  const callbacksRespondidos = [];
  const arquivos = new Map(); // file_id -> {conteudo, tamanho, file_path}
  const falhas = new Map(); // metodo -> [{status, corpo}]
  const ultimoEnvio = new Map(); // chat -> instante do último envio aceito
  let webhook = null;

  function aplicar(metodo, p) {
    const f = falhas.get(metodo)?.shift();
    if (f) return { status: f.status, corpo: f.corpo };
    switch (metodo) {
      case 'getMe':
        return { status: 200, corpo: { ok: true, result: { id: 123456, is_bot: true, first_name: 'Bot Falso', username: 'bot_falso_bot' } } };
      case 'getUpdates': {
        if (webhook) return { status: 409, corpo: erro(409, "Conflict: can't use getUpdates method while webhook is active") };
        if (p.offset !== undefined) {
          const off = Number(p.offset);
          if (!Number.isInteger(off)) return { status: 400, corpo: erro(400, 'Bad Request: offset must be an integer') };
          while (fila.length && fila[0].update_id < off) fila.shift();
        }
        const limite = Math.min(Math.max(Number(p.limit ?? 100) || 100, 1), 100);
        return { status: 200, corpo: { ok: true, result: fila.slice(0, limite) }, aguardar: fila.length === 0 ? Math.min(Number(p.timeout ?? 0) * 1000 || 0, esperaMaxLongPollMs) : 0 };
      }
      case 'sendMessage': {
        if (p.chat_id === undefined || p.chat_id === '') return { status: 400, corpo: erro(400, 'Bad Request: chat_id is empty') };
        if (typeof p.text !== 'string' || p.text.length === 0) return { status: 400, corpo: erro(400, 'Bad Request: message text is empty') };
        // o limite vale para o texto DEPOIS de interpretar as entidades (no modo HTML, `&amp;` conta como 1 caractere e as tags não contam)
        if (textoVisivel(p.text, p.parse_mode).length > LIMITE_TEXTO) return { status: 400, corpo: erro(400, 'Bad Request: message is too long') };
        if (p.parse_mode !== undefined && !['HTML', 'MarkdownV2', 'Markdown'].includes(p.parse_mode)) return { status: 400, corpo: erro(400, "Bad Request: unsupported parse_mode") };
        if (p.parse_mode === 'HTML') { const prob = problemaDeHtml(p.text); if (prob) return { status: 400, corpo: erro(400, prob) }; }
        const prob = problemaDeTeclado(p.reply_markup);
        if (prob) return { status: 400, corpo: erro(400, prob) };
        const chat = String(p.chat_id);
        if (limitePorChatMs > 0) {
          const decorrido = Date.now() - (ultimoEnvio.get(chat) ?? 0);
          if (decorrido < limitePorChatMs) {
            const espera = Math.max(1, Math.ceil((limitePorChatMs - decorrido) / 1000));
            return { status: 429, corpo: erro(429, `Too Many Requests: retry after ${espera}`, { retry_after: espera }) };
          }
        }
        ultimoEnvio.set(chat, Date.now());
        const m = { message_id: proximaMensagem++, from: { id: 123456, is_bot: true, first_name: 'Bot Falso' }, chat: { id: Number(p.chat_id) || p.chat_id, type: 'private' }, date: Math.floor(Date.now() / 1000), text: p.text };
        if (p.parse_mode) m.parse_mode = p.parse_mode;
        if (p.reply_markup) m.reply_markup = p.reply_markup;
        mensagens.set(`${chat}:${m.message_id}`, m);
        return { status: 200, corpo: { ok: true, result: m } };
      }
      case 'editMessageText': {
        const m = mensagens.get(`${p.chat_id}:${p.message_id}`);
        if (!m) return { status: 400, corpo: erro(400, 'Bad Request: message to edit not found') };
        if (typeof p.text !== 'string' || p.text.length === 0 || p.text.length > LIMITE_TEXTO) return { status: 400, corpo: erro(400, 'Bad Request: invalid text') };
        const prob = problemaDeTeclado(p.reply_markup);
        if (prob) return { status: 400, corpo: erro(400, prob) };
        m.text = p.text;
        if (p.reply_markup !== undefined) m.reply_markup = p.reply_markup;
        return { status: 200, corpo: { ok: true, result: m } };
      }
      case 'answerCallbackQuery':
        if (!p.callback_query_id) return { status: 400, corpo: erro(400, 'Bad Request: query id is empty') };
        callbacksRespondidos.push({ id: String(p.callback_query_id), text: p.text });
        return { status: 200, corpo: { ok: true, result: true } };
      case 'getFile': {
        const a = arquivos.get(p.file_id);
        if (!a) return { status: 400, corpo: erro(400, 'Bad Request: invalid file_id') };
        if (a.tamanho > LIMITE_DOWNLOAD_BYTES) return { status: 400, corpo: erro(400, 'Bad Request: file is too big') };
        return { status: 200, corpo: { ok: true, result: { file_id: p.file_id, file_unique_id: `u-${p.file_id}`, file_size: a.tamanho, file_path: a.file_path } } };
      }
      case 'setWebhook': {
        if (typeof p.url !== 'string' || !p.url.startsWith('https://')) return { status: 400, corpo: erro(400, 'Bad Request: bad webhook: HTTPS url must be provided for webhook') };
        if (p.secret_token !== undefined && !/^[A-Za-z0-9_-]{1,256}$/.test(String(p.secret_token))) return { status: 400, corpo: erro(400, 'Bad Request: secret token contains unallowed characters') };
        webhook = { url: p.url, secret_token: p.secret_token, allowed_updates: p.allowed_updates };
        return { status: 200, corpo: { ok: true, result: true } };
      }
      case 'deleteWebhook':
        webhook = null;
        if (p.drop_pending_updates) fila.length = 0;
        return { status: 200, corpo: { ok: true, result: true } };
      case 'getWebhookInfo':
        return { status: 200, corpo: { ok: true, result: { url: webhook?.url ?? '', pending_update_count: fila.length } } };
      default:
        return { status: 404, corpo: erro(404, 'Not Found') };
    }
  }

  const servidor = createServer((req, res) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (c) => { tamanho += c.length; if (tamanho <= 1_000_000) partes.push(c); });
    req.on('end', async () => {
      const responder = (status, corpo, tipo = 'application/json') => {
        res.writeHead(status, { 'content-type': tipo });
        res.end(typeof corpo === 'string' || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo));
      };
      try {
        const url = new URL(req.url, 'http://falso.local');
        const arq = url.pathname.match(/^\/file\/bot([^/]+)\/(.+)$/);
        if (arq) {
          if (arq[1] !== token) return responder(401, erro(401, 'Unauthorized'));
          const a = [...arquivos.values()].find((x) => x.file_path === arq[2]);
          if (!a || !a.conteudo) return responder(404, erro(404, 'Not Found'));
          return responder(200, a.conteudo, 'application/octet-stream');
        }
        const m = url.pathname.match(/^\/bot([^/]+)\/([A-Za-z]+)$/);
        if (!m) return responder(404, erro(404, 'Not Found'));
        const metodo = m[2];
        let params = Object.fromEntries(url.searchParams);
        const bruto = Buffer.concat(partes).toString('utf8');
        if (bruto) {
          if ((req.headers['content-type'] ?? '').includes('application/json')) {
            try { params = { ...params, ...JSON.parse(bruto) }; } catch { return responder(400, erro(400, 'Bad Request: invalid JSON')); }
          } else {
            params = { ...params, ...Object.fromEntries(new URLSearchParams(bruto)) };
            if (typeof params.reply_markup === 'string') { try { params.reply_markup = JSON.parse(params.reply_markup); } catch { /* deixa como texto */ } }
          }
        }
        if (m[1] !== token) return responder(401, erro(401, 'Unauthorized'));
        log.push({ metodo, params: structuredClone(params), quando: Date.now() });
        const r = aplicar(metodo, params);
        if (r.aguardar > 0) {
          const fim = Date.now() + r.aguardar;
          while (Date.now() < fim && fila.length === 0) await new Promise((ok) => setTimeout(ok, 10));
          return responder(200, { ok: true, result: fila.slice(0, 100) });
        }
        return responder(r.status, r.corpo);
      } catch (e) {
        return responder(500, erro(500, `Internal Server Error (${e?.message ?? 'erro'})`));
      }
    });
  });
  await new Promise((ok, falha) => { servidor.once('error', falha); servidor.listen(porta, '127.0.0.1', ok); });
  const endereco = servidor.address();

  const novoUsuario = (id) => ({ id, is_bot: false, first_name: `Usuario ${id}` });
  function injetarAtualizacao(corpo) {
    const u = { update_id: proximoUpdate++, ...corpo };
    fila.push(u);
    return u;
  }
  return {
    url: `http://127.0.0.1:${endereco.port}`,
    porta: endereco.port,
    token,
    /** Tudo que o bot chamou, na ordem (uma cópia). */
    requisicoes: () => structuredClone(log),
    chamadasDe: (metodo) => structuredClone(log.filter((r) => r.metodo === metodo)),
    mensagensEnviadas: () => structuredClone([...mensagens.values()]),
    callbacksRespondidos: () => structuredClone(callbacksRespondidos),
    updatesPendentes: () => fila.length,
    webhook: () => structuredClone(webhook),
    /** Mensagem de texto de um usuário (como se ele tivesse escrito para o bot). */
    injetarMensagem({ de, texto, chat = de, voz }) {
      const message = { message_id: proximaMensagem++, from: novoUsuario(de), chat: { id: chat, type: 'private' }, date: Math.floor(Date.now() / 1000) };
      if (texto !== undefined) message.text = texto;
      if (voz) message.voice = voz;
      return injetarAtualizacao({ message });
    },
    /** Clique num botão inline de uma mensagem do bot. */
    injetarCallback({ de, dado, mensagem }) {
      return injetarAtualizacao({ callback_query: { id: `cb-${proximoCallback++}`, from: novoUsuario(de), message: { message_id: mensagem.message_id, chat: mensagem.chat }, data: dado } });
    },
    injetarAtualizacao,
    /** Registra um arquivo que `getFile` e o download enxergam. `tamanho` pode ser maior que o conteúdo (para testar o limite de 20 MB). */
    registrarArquivo({ file_id, conteudo = Buffer.from(''), tamanho = Buffer.byteLength(conteudo), file_path = `voice/${file_id}.oga` }) {
      arquivos.set(file_id, { conteudo: Buffer.from(conteudo), tamanho, file_path });
    },
    /** Faz a PRÓXIMA chamada a `metodo` falhar com este status e este corpo (use várias vezes para uma sequência). */
    falharProximo(metodo, { status, corpo }) {
      const lista = falhas.get(metodo) ?? [];
      lista.push({ status, corpo });
      falhas.set(metodo, lista);
    },
    fechar: () => new Promise((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); }),
  };
}
