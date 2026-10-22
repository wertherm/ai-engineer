// Servidor falso, compatível com a API de chat, que FALHA de propósito de nove jeitos. É o "provedor ruim" do laboratório da Lição 2:
// o verificador o usa para testar o seu cliente, e você pode ligá-lo à mão para desenvolver sem gastar uma chamada de verdade.
//
//   node academia/licoes/02-apis-erros-e-integracao/kit/servidor-falso.mjs --listar
//   node academia/licoes/02-apis-erros-e-integracao/kit/servidor-falso.mjs --cenario limite-de-taxa [--porta 8089]
//   OPENAI_BASE_URL=http://127.0.0.1:8089/v1 OPENAI_API_KEY=abc node ... chamar.ts "Diga olá"
//
// Cada pedido consome o próximo passo do cenário; acabados os passos, o último se repete. Cada pedido é registrado (hora, cabeçalhos
// e corpo): é assim que o verificador confere quantas tentativas você fez e quanto esperou entre elas.
// O servidor NÃO valida a chave (aceita qualquer uma), mas o cenário `chave-invalida` devolve um 401 que repete a chave recebida
// na mensagem de erro, como alguns provedores fazem: o seu cliente não pode repassar isso adiante.
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { ehPrincipal } from '../../../ferramentas/comum.mjs';

const ok = (texto = 'Olá', { finish_reason = 'stop', uso = { prompt_tokens: 14, completion_tokens: 2, total_tokens: 16 } } = {}) => ({ tipo: 'ok', texto, finish_reason, uso });
const http_ = (status, corpo, cabecalhos = {}) => ({ tipo: 'http', status, corpo, cabecalhos });
const erroJson = (mensagem, type, code) => ({ error: { message: mensagem, type, code } });
const limite = (cabecalhos = {}) => http_(429, erroJson('Rate limit reached for requests. Please try again later.', 'rate_limit_error', 'rate_limit_exceeded'), cabecalhos);

/** Cenários do kit. `perfil: 'openai-novo'` imita provedores que recusam `max_tokens` e `temperature` (Lição 1, seção 4.6). */
export const CENARIOS = {
  'sucesso': { descricao: 'responde 200 com texto e usage', passos: [ok()] },
  'limite-de-taxa': { descricao: '429 com Retry-After: 1 e depois 200', passos: [limite({ 'retry-after': '1' }), ok()] },
  'sempre-429': { descricao: '429 de limite de taxa, sem Retry-After, para sempre', passos: [limite()] },
  'servidor-instavel': { descricao: '500, depois 503, depois 200', passos: [http_(500, erroJson('internal error', 'api_error', null)), http_(503, erroJson('overloaded', 'service_unavailable_error', 'server_is_overloaded')), ok()] },
  'sempre-503': { descricao: '503 para sempre', passos: [http_(503, erroJson('overloaded', 'service_unavailable_error', 'server_is_overloaded'))] },
  'lento': { descricao: 'demora 3 s para responder (use TIMEOUT_MS menor)', passos: [{ tipo: 'atraso', ms: 3000, depois: ok() }] },
  'devagar': { descricao: 'demora 150 ms e responde 200 (dentro do limite razoável)', passos: [{ tipo: 'atraso', ms: 150, depois: ok() }] },
  'gotejamento': { descricao: 'envia o cabeçalho e depois o corpo em conta-gotas por 4 s (timeout TOTAL, não só por inatividade)', passos: [{ tipo: 'gotejo', ms: 4000 }] },
  'derruba-conexao': { descricao: 'aceita a conexão e a derruba sem responder', passos: [{ tipo: 'derruba' }] },
  'chave-invalida': { descricao: '401 que repete a chave recebida na mensagem', passos: [{ tipo: 'autenticacao' }] },
  'requisicao-invalida': { descricao: '400 de requisição inválida', passos: [http_(400, erroJson('Invalid value for messages', 'invalid_request_error', 'invalid_value'))] },
  'cota-esgotada-formato-b': {
    descricao: '429 de teto de gasto no formato da Anthropic: type "rate_limit_error", SEM retry-after; só error.details.error_code o distingue',
    passos: [http_(429, { type: 'error', error: { type: 'rate_limit_error', message: 'You have reached your API usage limits.', details: { error_code: 'enforced_spend_limit_reached' } }, request_id: 'req_falso' })],
  },
  'cota-esgotada': { descricao: '429 de cota esgotada (esperar não adianta)', passos: [http_(429, erroJson('You exceeded your current quota, please check your plan and billing details.', 'insufficient_quota', 'insufficient_quota'))] },
  'truncado': { descricao: '200 com finish_reason "length" (resposta cortada)', passos: [ok('Olá, tudo be', { finish_reason: 'length', uso: { prompt_tokens: 14, completion_tokens: 64, total_tokens: 78 } })] },
  'html-no-lugar-de-json': { descricao: '200 com uma página HTML (proxy ou balanceador no meio)', passos: [{ tipo: 'http', status: 200, corpo: '<html><body>Bad gateway page</body></html>', cabecalhos: { 'content-type': 'text/html' } }] },
  'json-sem-choices': { descricao: '200 com JSON que não é uma resposta de chat', passos: [http_(200, { id: 'x', object: 'chat.completion' })] },
  'retry-after-gigante': { descricao: '429 com Retry-After: 3600', passos: [limite({ 'retry-after': '3600' })] },
  'retry-after-data': { descricao: '429 com Retry-After em formato de data (cerca de 2,5 s à frente) e depois 200', passos: [limite({ 'retry-after': () => new Date(Date.now() + 2500).toUTCString() }), ok()] },
  'provedor-b': { descricao: 'provedor que exige max_completion_tokens e recusa max_tokens e temperature', perfil: 'openai-novo', passos: [ok()] },
};

const lerCorpo = (req) => new Promise((resolve) => {
  const pedacos = [];
  req.on('data', (c) => pedacos.push(c));
  req.on('end', () => resolve(Buffer.concat(pedacos).toString('utf8')));
  req.on('error', () => resolve(''));
});

const resolver = (v) => (typeof v === 'function' ? v() : v);

function respostaDeChat(texto, modelo, finish_reason, uso) {
  return { id: 'chatcmpl-falso', object: 'chat.completion', model: modelo ?? 'falso', choices: [{ index: 0, message: { role: 'assistant', content: texto }, finish_reason }], usage: uso };
}

/**
 * @param {{ passos: object[], perfil?: 'ollama'|'openai-novo', porta?: number }} opcoes
 * @returns {Promise<{ url: string, registro: object[], fechar: () => Promise<void> }>}
 */
export async function iniciarServidor({ passos, perfil = 'ollama', porta = 0, resposta }) {
  const registro = [];
  const servidor = http.createServer(async (req, res) => {
    const texto = await lerCorpo(req);
    let corpo = null;
    try { corpo = JSON.parse(texto); } catch { /* corpo inválido: tratado abaixo */ }
    const indice = registro.length;
    registro.push({ n: indice + 1, t: performance.now(), metodo: req.method, caminho: req.url, cabecalhos: { ...req.headers }, corpo, corpoBruto: texto });
    const json = (status, obj, cab = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...cab }); res.end(JSON.stringify(obj)); };

    if (req.method !== 'POST' || !/\/chat\/completions$/.test(req.url ?? '')) return json(404, erroJson(`rota desconhecida: ${req.method} ${req.url}`, 'invalid_request_error', 'not_found'));
    if (!corpo || typeof corpo !== 'object') return json(400, erroJson('o corpo não é JSON', 'invalid_request_error', 'invalid_json'));
    if (perfil === 'openai-novo') {
      if (!req.headers.authorization?.startsWith('Bearer ')) return json(401, erroJson('chave ausente', 'invalid_request_error', 'invalid_api_key'));
      if ('max_tokens' in corpo) return json(400, erroJson("Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead.", 'invalid_request_error', 'unsupported_parameter'));
      if ('temperature' in corpo) return json(400, erroJson("Unsupported value: 'temperature' only supports the default value with this model.", 'invalid_request_error', 'unsupported_value'));
    }

    const passo = passos[Math.min(indice, passos.length - 1)];
    const executar = async (p) => {
      if (p.tipo === 'ok') {
        const [texto, uso] = resposta && p.finish_reason === 'stop' ? [resposta.texto, resposta.uso] : [p.texto, p.uso];
        return json(200, respostaDeChat(texto, corpo.model, p.finish_reason, uso));
      }
      if (p.tipo === 'http') {
        const cab = Object.fromEntries(Object.entries(p.cabecalhos ?? {}).map(([k, v]) => [k, resolver(v)]));
        if (typeof p.corpo === 'string') { res.writeHead(p.status, { 'content-type': 'text/plain', ...cab }); return res.end(p.corpo); }
        return json(p.status, p.corpo, cab);
      }
      if (p.tipo === 'autenticacao') {
        const chave = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
        return json(401, erroJson(`Incorrect API key provided: ${chave}. You can find your API key in the provider dashboard.`, 'invalid_request_error', 'invalid_api_key'));
      }
      if (p.tipo === 'derruba') return req.socket.destroy();
      if (p.tipo === 'atraso') {
        let cancelado = false;
        res.on('close', () => { cancelado = true; });
        await new Promise((r) => setTimeout(r, p.ms));
        return cancelado ? undefined : executar(p.depois);
      }
      if (p.tipo === 'gotejo') {
        res.writeHead(200, { 'content-type': 'application/json' });
        let cancelado = false;
        res.on('close', () => { cancelado = true; });
        const fim = performance.now() + p.ms;
        while (!cancelado && performance.now() < fim) { res.write(' '); await new Promise((r) => setTimeout(r, 100)); }
        return cancelado ? undefined : res.end(JSON.stringify(respostaDeChat(resposta?.texto ?? 'Olá', corpo.model, 'stop', resposta?.uso ?? { prompt_tokens: 14, completion_tokens: 2, total_tokens: 16 })));
      }
      return json(500, erroJson(`passo desconhecido: ${p.tipo}`, 'api_error', null));
    };
    return executar(passo);
  });
  await new Promise((resolve) => servidor.listen(porta, '127.0.0.1', resolve));
  const { port } = servidor.address();
  return {
    url: `http://127.0.0.1:${port}/v1`,
    registro,
    fechar: () => new Promise((resolve) => { servidor.close(() => resolve()); servidor.closeAllConnections(); }),
  };
}

/** Porta livre em que NADA escuta (para simular conexão recusada). */
export async function portaFechada() {
  const s = http.createServer();
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  const { port } = s.address();
  await new Promise((resolve) => s.close(resolve));
  return port;
}

if (ehPrincipal(import.meta.url)) {
  const args = process.argv.slice(2);
  const valor = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--listar') || !valor('--cenario')) {
    console.log('Cenários (use --cenario <nome>):\n');
    for (const [nome, c] of Object.entries(CENARIOS)) console.log(`  ${nome.padEnd(22)} ${c.descricao}`);
    process.exit(args.includes('--listar') ? 0 : 2);
  }
  const c = CENARIOS[valor('--cenario')];
  if (!c) { console.error(`cenário desconhecido: ${valor('--cenario')} (veja --listar)`); process.exit(2); }
  const srv = await iniciarServidor({ passos: c.passos, perfil: c.perfil, porta: Number(valor('--porta') ?? 0) });
  console.log(`servidor falso (${valor('--cenario')}: ${c.descricao})\nOPENAI_BASE_URL=${srv.url}\nCtrl+C para parar.\n`);
  let ja = 0;
  setInterval(() => {
    for (const r of srv.registro.slice(ja)) {
      const auth = r.cabecalhos.authorization ? (/^Bearer /.test(r.cabecalhos.authorization) ? 'Bearer ***' : '(oculto)') : '(sem chave)';
      console.log(`#${r.n} ${r.metodo} ${r.caminho} auth=${auth} corpo=${(r.corpoBruto ?? '').slice(0, 160)}`);
    }
    ja = srv.registro.length;
  }, 100);
}
