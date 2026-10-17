// Exemplo 07 · AI Gateway mínimo (U5): o ponto único por onde TODA chamada de IA passa.
// Concentra o que não deve ficar espalhado nos serviços: identificação do tenant, rate limit, política de
// tiers (Policy-Driven Control), tracing (traceparent W3C), log estruturado, custo e métricas Prometheus.
// Só node:http, sem framework, para enxergar cada responsabilidade.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chat, config as infra } from '../../comum/llm.js';

const cfg = JSON.parse(readFileSync(new URL('./gateway.config.json', import.meta.url)));
const porta = Number(process.env.PORTA ?? cfg.porta);

// Token bucket por tenant: aguenta rajadas até "capacidade" e recarrega devagar.
const baldes = new Map();
function consumirFicha(tenant) {
  const { capacidade, recargaPorSeg } = cfg.tenants[tenant].rateLimit;
  const agora = Date.now() / 1000;
  const b = baldes.get(tenant) ?? { fichas: capacidade, em: agora };
  b.fichas = Math.min(capacidade, b.fichas + (agora - b.em) * recargaPorSeg);
  b.em = agora;
  baldes.set(tenant, b);
  if (b.fichas < 1) return false;
  b.fichas -= 1;
  return true;
}

// Métricas em memória no formato texto do Prometheus (contadores com labels).
const metricas = new Map();
const inc = (nome, labels, v = 1) => {
  const k = `${nome}{${Object.entries(labels).map(([a, b]) => `${a}="${b}"`).join(',')}}`;
  metricas.set(k, (metricas.get(k) ?? 0) + v);
};

// traceparent W3C: 00-<trace-id 32 hex>-<span-id 16 hex>-01. Reaproveita o trace do chamador se vier.
function trace(req) {
  const m = /^00-([0-9a-f]{32})-[0-9a-f]{16}-0[01]$/.exec(req.headers.traceparent ?? '');
  return m ? m[1] : randomBytes(16).toString('hex');
}

const responder = (res, status, corpo, traceId) => {
  res.writeHead(status, { 'content-type': 'application/json', 'x-trace-id': traceId });
  res.end(JSON.stringify(corpo));
};

const servidor = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/metrics') {
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
    return res.end([...metricas].map(([k, v]) => `${k} ${Number(v.toPrecision(10))}`).join('\n') + '\n');
  }
  if (req.method === 'GET' && req.url === '/health') return responder(res, 200, { ok: true }, '-');

  const traceId = trace(req);
  const t0 = performance.now();
  const tenant = req.headers['x-tenant'];
  let corpo = '';
  for await (const parte of req) corpo += parte;
  const { mensagem, tier = 'barato' } = JSON.parse(corpo || '{}');

  // Cada recusa acontece ANTES de gastar token: é aqui que o gateway economiza dinheiro.
  const log = (status, extra = {}) => {
    // Label só com valores conhecidos: header livre como label explode a cardinalidade do Prometheus.
    inc('gateway_requisicoes_total', { tenant: cfg.tenants[tenant] ? tenant : 'desconhecido', tier, status });
    console.log(JSON.stringify({ traceId, tenant, tier, status, ms: Math.round(performance.now() - t0), ...extra }));
  };
  if (!cfg.tenants[tenant]) { log(401); return responder(res, 401, { erro: 'tenant desconhecido' }, traceId); }
  if (!cfg.tenants[tenant].tiers.includes(tier)) { log(403); return responder(res, 403, { erro: `tier ${tier} não permitido para ${tenant}` }, traceId); }
  if (!consumirFicha(tenant)) { log(429); return responder(res, 429, { erro: 'rate limit' }, traceId); }

  try {
    const t = cfg.tiers[tier];
    // O prompt NÃO vai para o log (pode ter dado pessoal); vai o tamanho. Rastreie prompts com amostragem e mascaramento.
    const r = await chat([{ role: 'user', content: mensagem }], { maxTokens: t.maxTokens });
    const usd = (r.usage.prompt_tokens * t.precoIn + r.usage.completion_tokens * t.precoOut) / 1e6;
    inc('gateway_tokens_total', { tenant, tier }, r.usage.total_tokens);
    inc('gateway_custo_usd_total', { tenant }, usd);
    log(200, { modelo: infra.modeloChat, promptChars: mensagem.length, tokens: r.usage.total_tokens, usd: +usd.toFixed(6) });
    responder(res, 200, { resposta: r.texto, tokens: r.usage.total_tokens }, traceId);
  } catch (err) {
    log(502, { erro: err.message });
    responder(res, 502, { erro: 'upstream falhou' }, traceId);
  }
});

servidor.listen(porta, () => console.error(`gateway ouvindo em http://localhost:${porta}`));
