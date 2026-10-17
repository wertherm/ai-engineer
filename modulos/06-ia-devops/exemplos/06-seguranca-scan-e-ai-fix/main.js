// Segurança com IA no loop: scanner determinístico (Trivy) acha → LLM explica e propõe o fix →
// validação (YAML + dry-run no API server) → re-scan prova que melhorou e que não piorou nada.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { chat, resumoUso, tirarCercas } from '../../comum/llm.js';
import { run, kubectl } from '../../comum/shell.js';

const DIR = import.meta.dirname;
const ALVOS = path.join(DIR, 'alvos');
const SAIDA = path.join(DIR, 'saida');
const ORDEM = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

async function trivyConfig(alvo) {
  const r = await run('trivy', ['config', '--quiet', '--format', 'json', alvo], { timeoutMs: 600_000 });
  if (!r.ok) throw new Error(`trivy falhou: ${r.stderr}`);
  return (JSON.parse(r.stdout).Results ?? []).filter((x) => x.Misconfigurations?.length);
}

const contar = (ms) => Object.entries(ms.reduce((a, m) => ({ ...a, [m.Severity]: (a[m.Severity] ?? 0) + 1 }), {}))
  .sort((a, b) => ORDEM[a[0]] - ORDEM[b[0]]).map(([s, n]) => `${s}=${n}`).join(' ');

async function main() {
  await mkdir(SAIDA, { recursive: true });

  // 1. Scan de IaC, manifests e Dockerfile (misconfigurations).
  console.log('== 1. trivy config alvos/ ==');
  const antes = await trivyConfig(ALVOS);
  for (const r of antes) console.log(`   ${r.Target.padEnd(16)} ${contar(r.Misconfigurations)}`);

  // 2. Vazamento de segredo: geramos um arquivo com um token FALSO em tempo de execução (não fica no repo,
  //    para não disparar o push protection do GitHub) e rodamos o scanner de segredos.
  console.log('\n== 2. trivy fs --scanners secret ==');
  const dirSegredo = path.join(SAIDA, 'segredo');
  await mkdir(dirSegredo, { recursive: true });
  const falso = 'ghp_' + 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7d';
  await writeFile(path.join(dirSegredo, 'app.env'), `PORTA=8080\nGITHUB_TOKEN=${falso}\n`);
  const sec = JSON.parse((await run('trivy', ['fs', '--quiet', '--scanners', 'secret', '--format', 'json', dirSegredo])).stdout);
  for (const r of sec.Results ?? []) for (const s of r.Secrets ?? []) console.log(`   ${s.Severity} ${s.RuleID} em ${r.Target}:${s.StartLine} → ${s.Match}`);
  await rm(dirSegredo, { recursive: true });

  // 3. AI fix só do manifest K8s (o mais acionável). Mandamos só HIGH/MEDIUM: prompt curto e foco.
  console.log('\n== 3. LLM explica e corrige deployment.yaml ==');
  const manifest = await readFile(path.join(ALVOS, 'deployment.yaml'), 'utf8');
  const achados = antes.find((r) => r.Target === 'deployment.yaml').Misconfigurations
    .filter((m) => ['HIGH', 'MEDIUM'].includes(m.Severity))
    .map((m) => `- ${m.ID} (${m.Severity}): ${m.Title}`).join('\n');
  const { msg: expl } = await chat([
    { role: 'system', content: 'Você é um engenheiro de segurança. Explique em português, em até 3 frases curtas, o RISCO REAL dos achados mais graves para um time de produto.' },
    { role: 'user', content: achados },
  ], { maxTokens: 110 });
  console.log(`   explicação: ${expl.content.trim().replace(/\n+/g, ' ')}`);

  const { msg: fix, ms } = await chat([
    { role: 'system', content: 'Corrija o manifest Kubernetes para resolver os achados. Mantenha nome, labels, réplicas e porta. ' +
      'Use imagem nginxinc/nginx-unprivileged:1.31.6-alpine na porta 8080, namespace "pagamentos", securityContext restritivo e requests/limits. Responda só com o YAML.' },
    { role: 'user', content: `Achados:\n${achados}\n\nManifest:\n${manifest}` },
  ], { maxTokens: 450 });
  const corrigido = tirarCercas(fix.content);
  const arq = path.join(SAIDA, 'deployment.corrigido.yaml');
  await writeFile(arq, corrigido);
  console.log(`   fix proposto em ${(ms / 1000).toFixed(0)}s → ${path.relative(process.cwd(), arq)}`);

  // 4. Validação determinística do fix: é YAML? o API server aceita? (dry-run não grava nada)
  try {
    YAML.parse(corrigido);
  } catch (e) {
    console.log(`   ✗ YAML inválido: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const dry = await kubectl(['apply', '--dry-run=client', '--validate=strict', '-f', arq]);
  const dryServer = await kubectl(['apply', '--dry-run=server', '-n', 'default', '-f', '-'],
    { input: corrigido.replace(/^\s*namespace:.*$/m, '') }); // o namespace "pagamentos" não existe no kind
  console.log(`   dry-run client: ${dry.ok ? '✓' : '✗ ' + dry.stderr.trim()} · dry-run server: ${dryServer.ok ? '✓' : '✗ ' + dryServer.stderr.trim()}`);

  // 5. Re-scan: o fix só vale se reduzir os achados e não criar nenhum novo.
  console.log('\n== 4. re-scan ==');
  const depois = (await trivyConfig(arq))[0]?.Misconfigurations ?? [];
  const idsAntes = new Set(antes.find((r) => r.Target === 'deployment.yaml').Misconfigurations.map((m) => m.ID));
  const novos = depois.filter((m) => !idsAntes.has(m.ID));
  console.log(`   antes : ${contar(antes.find((r) => r.Target === 'deployment.yaml').Misconfigurations)}`);
  console.log(`   depois: ${contar(depois) || 'nenhum achado'}`);
  console.log(`   restantes: ${depois.map((m) => m.ID).join(', ') || '-'} · novos introduzidos pelo fix: ${novos.map((m) => m.ID).join(', ') || 'nenhum'}`);
  // 6. Veredito determinístico: o fix só segue para PR se o API server aceitou e nada novo apareceu.
  const aceito = dry.ok && dryServer.ok && novos.length === 0 && depois.length < idsAntes.size;
  console.log(`\nVeredito: fix ${aceito ? 'ACEITO → segue para PR com revisão humana' : 'REJEITADO → não vai para o PR (devolver ao LLM ou corrigir à mão)'}`);
  console.log(`${resumoUso()}`);
}

await main();
