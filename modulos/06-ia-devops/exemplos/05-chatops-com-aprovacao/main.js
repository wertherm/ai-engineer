// Roteiro de uma "conversa" de ChatOps contra o cluster kind, com trilha de auditoria no Postgres (m06).
// Para usar interativo: node exemplos/05-chatops-com-aprovacao/main.js --interativo
import readline from 'node:readline/promises';
import { criarPool, resumoUso } from '../../comum/llm.js';
import { kubectl } from '../../comum/shell.js';
import { BotChatOps, NS } from './bot.js';

const USUARIOS = { ana: 'viewer', bruno: 'dev', carla: 'sre', diego: 'sre' };
const IMG_OK = 'nginxinc/nginx-unprivileged:1.31.6-alpine';

const ROTEIRO = [
  ['ana', '/scale web 3'], // viewer não pode
  ['bruno', '/scale web 3'], // dev pede → fica pendente com o diff
  ['bruno', '/aprovar 1'], // dev não aprova
  ['carla', '/aprovar 1'], // SRE aprova → executa
  ['carla', '/rollback web'], // SRE pede um rollback...
  ['carla', '/aprovar 2'], // ...e tenta aprovar o próprio pedido: four-eyes nega (fica pendente)
  ['bruno', '/deploy web nginxinc/nginx-unprivileged:9.9.9-nao-existe'],
  ['carla', '/aprovar 3'], // falha 1 → desfeito
  ['bruno', '/deploy web nginxinc/nginx-unprivileged:9.9.8-nao-existe'],
  ['diego', '/aprovar 4'], // falha 2 → circuito abre
  ['bruno', '/scale web 2'],
  ['carla', '/aprovar 5'], // bloqueado pelo circuit breaker
  ['ana', '/investigar web'], // leitura + resumo do LLM
];

async function prepararCluster() {
  await kubectl(['create', 'namespace', NS]);
  const yaml = `apiVersion: apps/v1
kind: Deployment
metadata: { name: web, namespace: ${NS} }
spec:
  replicas: 2
  progressDeadlineSeconds: 30
  selector: { matchLabels: { app: web } }
  template:
    metadata: { labels: { app: web } }
    spec:
      containers:
        - name: web
          image: ${IMG_OK}
          imagePullPolicy: IfNotPresent
          readinessProbe: { httpGet: { path: /, port: 8080 }, periodSeconds: 3 }
`;
  await kubectl(['apply', '-f', '-'], { input: yaml });
  await kubectl(['-n', NS, 'rollout', 'status', 'deploy/web', '--timeout=90s']);
}

async function main() {
  const pool = await criarPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS m06.chatops_auditoria (
    id serial PRIMARY KEY, ts timestamptz DEFAULT now(), usuario text, papel text,
    comando text, decisao text, detalhe text)`);
  await pool.query('TRUNCATE m06.chatops_auditoria');
  // Trilha append-only: o bot só faz INSERT. (Em produção: role sem UPDATE/DELETE nesta tabela.)
  const auditar = (r) => pool.query(
    'INSERT INTO m06.chatops_auditoria (usuario, papel, comando, decisao, detalhe) VALUES ($1,$2,$3,$4,$5)',
    [r.usuario, r.papel, r.comando, r.decisao, r.detalhe.slice(0, 300)],
  );

  await prepararCluster();
  const bot = new BotChatOps({ usuarios: USUARIOS, auditar });

  if (process.argv.includes('--interativo')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`Usuários: ${JSON.stringify(USUARIOS)}. Formato: <usuario> /comando args (Ctrl+D sai)`);
    for await (const linha of rl) {
      const [u, ...resto] = linha.trim().split(/\s+/);
      if (u) console.log(await bot.receber(u, resto.join(' ')));
    }
  } else {
    for (const [u, texto] of ROTEIRO) {
      console.log(`${u.padEnd(5)} › ${texto}`);
      console.log(`  bot › ${await bot.receber(u, texto)}`);
    }
  }

  const { rows } = await pool.query('SELECT id, usuario, decisao, left(detalhe, 70) AS detalhe FROM m06.chatops_auditoria ORDER BY id');
  console.log('\nTrilha de auditoria (m06.chatops_auditoria):');
  console.table(rows);
  const img = await kubectl(['-n', NS, 'get', 'deploy', 'web', '-o', 'jsonpath={.spec.replicas} réplicas · {.spec.template.spec.containers[0].image}']);
  console.log(`Estado final do web: ${img.stdout}`);

  if (!process.argv.includes('--manter')) await kubectl(['delete', 'namespace', NS, '--wait=false']);
  await pool.end();
  console.log(resumoUso());
}

await main();
