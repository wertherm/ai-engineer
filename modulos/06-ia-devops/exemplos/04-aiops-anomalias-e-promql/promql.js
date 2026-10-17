// NL → PromQL com dupla validação determinística:
//  1) sintaxe: o parser OFICIAL do Prometheus (`promtool check rules`, via imagem Docker prom/prometheus);
//  2) semântica: toda métrica e todo label usados precisam existir no catálogo (anti-alucinação).
import YAML from 'yaml';
import { chat, resumoUso } from '../../comum/llm.js';
import { run } from '../../comum/shell.js';

const IMAGEM_PROM = process.env.IMAGEM_PROM ?? 'prom/prometheus:v3.15.0';

// Catálogo de métricas que EXISTEM no seu Prometheus (em produção: GET /api/v1/metadata e /api/v1/labels).
const CATALOGO = {
  http_requests_total: ['service', 'status', 'method'],
  http_request_duration_seconds_bucket: ['service', 'le'],
  container_memory_working_set_bytes: ['namespace', 'pod', 'container'],
  kube_pod_container_status_restarts_total: ['namespace', 'pod', 'container'],
};

const PERGUNTAS = [
  'Qual a porcentagem de respostas 5xx do serviço checkout nos últimos 5 minutos?',
  'Qual a latência p95 do serviço checkout nos últimos 5 minutos?',
  'Quais pods do namespace prod reiniciaram mais de 3 vezes na última hora?',
];

const SYSTEM = `Você traduz perguntas em PromQL. Métricas disponíveis (nome: labels):
${Object.entries(CATALOGO).map(([m, l]) => `- ${m}: ${l.join(', ')}`).join('\n')}
Use SÓ essas métricas e labels. Responda apenas com a expressão PromQL, numa linha, sem crases.`;

/** Valida sintaxe de várias expressões numa única execução do promtool (1 container só). */
async function validarSintaxe(exprs) {
  const regras = { groups: [{ name: 'nl2promql', rules: exprs.map((e, i) => ({ record: `q:${i}`, expr: e })) }] };
  const r = await run('docker', ['run', '--rm', '-i', '--entrypoint', 'promtool', IMAGEM_PROM, 'check', 'rules', '/dev/stdin'],
    { input: YAML.stringify(regras) });
  return r.ok ? null : (r.stdout + r.stderr).split('\n').find((l) => l.includes('parse error')) ?? r.stderr.trim();
}

const PALAVRAS = new Set(['sum', 'avg', 'min', 'max', 'count', 'rate', 'irate', 'increase', 'delta', 'by', 'without',
  'histogram_quantile', 'topk', 'bottomk', 'and', 'or', 'unless', 'on', 'ignoring', 'group_left', 'group_right',
  'offset', 'bool', 'abs', 'clamp_min', 'clamp_max', 'sum_over_time', 'avg_over_time', 'max_over_time', 'changes', 'resets']);

/** Confere métricas e labels contra o catálogo. Devolve lista de problemas. */
function validarCatalogo(expr) {
  const problemas = [];
  const semStrings = expr.replace(/"[^"]*"/g, '""');
  // Labels usados em matchers {a="x"} e em by(...)/without(...)/on(...).
  const labels = [...semStrings.matchAll(/([a-zA-Z_]\w*)\s*(?:=~|!~|!=|=)/g)].map((m) => m[1]);
  for (const g of semStrings.matchAll(/\b(?:by|without|on|ignoring)\s*\(([^)]*)\)/g)) labels.push(...g[1].split(',').map((s) => s.trim()).filter(Boolean));
  // Métricas: identificadores fora de {} e de by(...), que não são função/palavra-chave.
  const corpo = semStrings.replace(/\{[^}]*\}/g, '').replace(/\b(?:by|without|on|ignoring)\s*\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
  const metricas = [...corpo.matchAll(/\b([a-zA-Z_:][\w:]*)\b(?!\s*\()/g)].map((m) => m[1]).filter((t) => !PALAVRAS.has(t) && !/^\d/.test(t));
  if (!metricas.length) problemas.push('nenhuma métrica do catálogo foi usada');
  const labelsValidos = new Set();
  for (const m of metricas) {
    if (!CATALOGO[m]) problemas.push(`métrica inexistente: ${m}`);
    else CATALOGO[m].forEach((l) => labelsValidos.add(l));
  }
  for (const l of new Set(labels)) if (labelsValidos.size && !labelsValidos.has(l)) problemas.push(`label inexistente: ${l}`);
  return problemas;
}

async function traduzir(pergunta) {
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: pergunta }];
  for (let t = 1; t <= 2; t++) {
    const { msg, ms } = await chat(messages, { maxTokens: 90 });
    const expr = msg.content.replace(/`/g, '').trim().split('\n')[0];
    const erroSintaxe = await validarSintaxe([expr]);
    const problemas = erroSintaxe ? [`sintaxe: ${erroSintaxe}`] : validarCatalogo(expr);
    console.log(`   tentativa ${t} (${(ms / 1000).toFixed(0)}s): ${expr}`);
    if (!problemas.length) return { expr, ok: true };
    problemas.forEach((p) => console.log(`     ✗ ${p}`));
    messages.push({ role: 'assistant', content: expr }, { role: 'user', content: `Inválida: ${problemas.join('; ')}. Corrija.` });
  }
  return { ok: false };
}

async function main() {
  // Sanidade do validador antes de confiar nele: uma expressão quebrada e uma alucinada.
  console.log('Autoteste do validador:');
  console.log(`   sintaxe quebrada  → ${await validarSintaxe(['sum(rate(http_requests_total[5m])'])}`);
  console.log(`   métrica alucinada → ${validarCatalogo('rate(http_errors_total{svc="checkout"}[5m])').join('; ')}\n`);

  let validas = 0;
  for (const p of PERGUNTAS) {
    console.log(`Pergunta: ${p}`);
    const r = await traduzir(p);
    validas += r.ok;
    console.log(`   ${r.ok ? '✓ aprovada' : '✗ descartada (não vai para o dashboard)'}\n`);
  }
  console.log(`${validas}/${PERGUNTAS.length} consultas aprovadas · ${resumoUso()}`);
}

await main();
