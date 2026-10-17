// Agente de deploy end-to-end: NL → spec (LLM) → validação → dry-run no servidor → apply →
// espera readiness → rollback automático se a nova versão não ficar pronta.
import { chat, extrairJson, resumoUso } from '../../comum/llm.js';
import { kubectl } from '../../comum/shell.js';
import { renderizar, validarSpec } from './manifests.js';

const NS = 'm06-deploy';
const PEDIDO = process.argv[2] ??
  'Publique o serviço vitrine com a imagem nginxinc/nginx-unprivileged:1.31.6-alpine, 2 réplicas, ' +
  'porta 8080, escalando até 4 réplicas quando a CPU passar de 70%.';
const MANTER = process.argv.includes('--manter');

const log = (etapa, texto) => console.log(`[${etapa.padEnd(9)}] ${texto}`);

async function extrairSpec(pedido) {
  // JSON mode + "formulário" pequeno: ~60 tokens de saída em vez de ~400 de YAML.
  const messages = [
    {
      role: 'system',
      content: 'Extraia do pedido um JSON com as chaves: nome (string), imagem (string com tag), replicas (int), ' +
        'porta (int), maxReplicas (int), cpuAlvo (int, %). Não invente valores que não estão no pedido: use null. ' +
        // Few-shot: sem este exemplo o qwen3.5:4b devolvia a imagem como "<repo:tag>" (e até "<img src=...>").
        'Exemplo de saída: {"nome":"api","imagem":"repo/app:1.2.3","replicas":1,"porta":8080,"maxReplicas":3,"cpuAlvo":60}',
    },
    { role: 'user', content: pedido },
  ];
  // Mesmo padrão do exemplo 01: a validação do formulário reprova e o erro volta ao LLM (máx. 2 tentativas).
  for (let t = 1; t <= 2; t++) {
    const { msg, ms } = await chat(messages, { json: true, maxTokens: 120 });
    log('llm', `tentativa ${t}, ${(ms / 1000).toFixed(1)}s: ${msg.content.replace(/\s+/g, ' ')}`);
    const spec = extrairJson(msg.content);
    const erros = validarSpec(spec);
    if (!erros.length) return spec;
    erros.forEach((e) => log('validação', `✗ ${e}`));
    messages.push(msg, { role: 'user', content: `Formulário inválido: ${erros.join('; ')}. Devolva o JSON corrigido.` });
  }
  return null;
}

/** Aplica com portões: dry-run=server → apply → rollout status; se falhar, rollout undo. */
async function implantar(spec, rotulo) {
  const erros = validarSpec(spec);
  if (erros.length) {
    erros.forEach((e) => log('validação', `✗ ${e}`));
    return false;
  }
  log('validação', `✓ spec ok (${rotulo})`);
  const yaml = renderizar(spec, NS);

  // dry-run=server: o API server roda admission, defaults e validação de schema sem persistir nada.
  const dry = await kubectl(['apply', '--dry-run=server', '-f', '-'], { input: yaml });
  if (!dry.ok) {
    log('dry-run', `✗ ${dry.stderr.trim()}`);
    return false;
  }
  log('dry-run', `✓ ${dry.stdout.trim().split('\n').join(' · ')}`);

  const ap = await kubectl(['apply', '-f', '-'], { input: yaml });
  log('apply', ap.stdout.trim().split('\n').join(' · '));

  // Portão de readiness: o rollout só "termina" quando as réplicas novas passam na readinessProbe.
  const t0 = Date.now();
  const st = await kubectl(['-n', NS, 'rollout', 'status', `deploy/${spec.nome}`, '--timeout=75s']);
  const seg = ((Date.now() - t0) / 1000).toFixed(0);
  if (st.ok) {
    log('readiness', `✓ pronto em ${seg}s`);
    return true;
  }
  log('readiness', `✗ não ficou pronto em ${seg}s: ${(st.stderr || st.stdout).trim().split('\n').pop()}`);
  const pods = await kubectl(['-n', NS, 'get', 'pods', '-l', `app=${spec.nome}`, '--no-headers',
    '-o', 'custom-columns=POD:.metadata.name,MOTIVO:.status.containerStatuses[0].state.waiting.reason']);
  log('evidência', pods.stdout.trim().split('\n').join(' | '));

  // Rollback automático para a revisão anterior (é aqui que o revisionHistoryLimit importa).
  const undo = await kubectl(['-n', NS, 'rollout', 'undo', `deploy/${spec.nome}`]);
  log('rollback', undo.stdout.trim() || undo.stderr.trim());
  const st2 = await kubectl(['-n', NS, 'rollout', 'status', `deploy/${spec.nome}`, '--timeout=60s']);
  log('rollback', st2.ok ? '✓ versão anterior servindo de novo' : `✗ rollback não estabilizou: ${st2.stderr}`);
  return false;
}

async function imagemAtual(nome) {
  const r = await kubectl(['-n', NS, 'get', 'deploy', nome, '-o', 'jsonpath={.spec.template.spec.containers[0].image}']);
  return r.stdout;
}

async function main() {
  console.log(`Pedido: ${PEDIDO}\n`);
  await kubectl(['create', 'namespace', NS]); // idempotente o suficiente: ignora "AlreadyExists"

  const spec = await extrairSpec(PEDIDO);
  if (!spec) {
    log('fim', 'spec continua inválida: escalar para um humano');
    process.exitCode = 1;
    return;
  }
  console.log('\n== Release 1: versão pedida ==');
  const ok1 = await implantar(spec, 'release 1');
  if (!ok1) {
    process.exitCode = 1;
    return;
  }
  const hpa = await kubectl(['-n', NS, 'get', 'hpa', spec.nome, '--no-headers']);
  log('hpa', hpa.stdout.trim());

  // Release 2 simulada: alguém digita a tag errada. Mudança determinística (sem LLM) para provar
  // que o portão de readiness + rollback protege o serviço.
  console.log('\n== Release 2: tag inexistente (falha proposital) ==');
  const ok2 = await implantar({ ...spec, imagem: spec.imagem.replace(/:[^:]+$/, ':9.9.9-nao-existe') }, 'release 2');
  log('estado', `release 2 ${ok2 ? 'aprovada' : 'revertida'}; imagem em produção: ${await imagemAtual(spec.nome)}`);

  if (!MANTER) {
    await kubectl(['delete', 'namespace', NS, '--wait=false']);
    log('limpeza', `namespace ${NS} removido (use --manter para inspecionar)`);
  }
  console.log(`\n${resumoUso()}`);
}

await main();
