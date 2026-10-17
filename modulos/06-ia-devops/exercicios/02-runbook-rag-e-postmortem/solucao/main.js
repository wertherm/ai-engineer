// Solução do exercício 02: alerta → RAG de runbooks (pgvector) → verificação → mitigação com allowlist,
// dry-run e aprovação humana → validação → timeline → post-mortem blameless (LLM) → lição volta ao índice.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { chat, embed, criarPool, vetor, resumoUso } from '../../../comum/llm.js';
import { kubectl } from '../../../comum/shell.js';

const AQUI = import.meta.dirname;
const NS = 'm06-runbook';
const APP = 'relatorios';
const SCORE_MINIMO = 0.5; // abaixo disto o agente não executa nada: escala para humano
// Allowlist de verbos que a automação pode executar. `delete` fica de fora de propósito.
const VERBOS_PERMITIDOS = new Set(['get', 'describe', 'logs', 'set', 'rollout', 'scale']);
const VERBOS_MUTANTES = new Set(['set', 'scale', 'rollout']);

const timeline = [];
const marcar = (evento) => {
  const hora = new Date().toISOString().slice(11, 19);
  timeline.push(`${hora} ${evento}`);
  console.log(`[${hora}] ${evento}`);
};

/** Divide o Markdown em seções "## Título" e extrai os comandos dos blocos ```bash. */
function parseRunbook(md) {
  const titulo = md.match(/^# (.+)$/m)[1];
  const secoes = {};
  for (const bloco of md.split(/^## /m).slice(1)) {
    const [cab, ...resto] = bloco.split('\n');
    const corpo = resto.join('\n');
    secoes[cab.trim()] = {
      texto: corpo.replace(/```bash[\s\S]*?```/g, '').trim(),
      comandos: [...corpo.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap((m) => m[1].trim().split('\n')),
    };
  }
  return { titulo, secoes };
}

async function indexar(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS m06.runbooks (
    arquivo text PRIMARY KEY, titulo text, conteudo text, embedding vector(1024))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS m06.postmortems (
    id serial PRIMARY KEY, ts timestamptz DEFAULT now(), alerta text, app text, conteudo text, embedding vector(1024))`);
  const dir = path.join(AQUI, 'runbooks');
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  const docs = await Promise.all(arquivos.map(async (f) => ({ f, md: await readFile(path.join(dir, f), 'utf8') })));
  // Indexamos título + Sintoma: é contra o sintoma que o alerta precisa casar (não contra os comandos).
  const textos = docs.map(({ md }) => { const r = parseRunbook(md); return `${r.titulo}\n${r.secoes['Sintoma'].texto}`; });
  const vetores = await embed(textos);
  for (const [i, { f, md }] of docs.entries()) {
    await pool.query(`INSERT INTO m06.runbooks VALUES ($1,$2,$3,$4::vector)
      ON CONFLICT (arquivo) DO UPDATE SET titulo=$2, conteudo=$3, embedding=$4::vector`,
    [f, parseRunbook(md).titulo, md, vetor(vetores[i])]);
  }
  return docs.length;
}

/** Converte a linha do runbook em argv, valida allowlist/namespace e preenche as variáveis conhecidas. */
function prepararComando(linha, vars) {
  const preenchida = linha.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  const argv = preenchida.split(/\s+/);
  if (argv[0] !== 'kubectl') return { erro: `não é kubectl: ${argv[0]}` };
  if (/\{\{/.test(preenchida)) return { erro: `variável sem valor em: ${preenchida}` };
  const verbo = argv[3];
  if (argv[1] !== '-n' || argv[2] !== vars.namespace) return { erro: 'comando fora do namespace do alerta' };
  if (!VERBOS_PERMITIDOS.has(verbo)) return { erro: `verbo "${verbo}" fora da allowlist` };
  return { argv: argv.slice(1), texto: preenchida, mutante: VERBOS_MUTANTES.has(verbo) && argv[4] !== 'status' };
}

async function aprovar(descricao) {
  if (process.argv.includes('--auto-aprovar')) return { ok: true, quem: 'aprovação simulada (--auto-aprovar)' };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resp = await rl.question(`Aprovar "${descricao}"? [s/N] `);
  rl.close();
  return { ok: resp.trim().toLowerCase() === 's', quem: 'operador no terminal' };
}

async function prepararIncidente() {
  await kubectl(['create', 'namespace', NS]);
  // Carga que precisa de ~50 MB com limite de 32Mi: vai morrer por OOM até alguém subir o limite.
  const yaml = `apiVersion: apps/v1
kind: Deployment
metadata: { name: ${APP}, namespace: ${NS} }
spec:
  replicas: 1
  selector: { matchLabels: { app: ${APP} } }
  template:
    metadata: { labels: { app: ${APP} } }
    spec:
      containers:
        - name: ${APP}
          image: curlimages/curl:8.17.0
          imagePullPolicy: IfNotPresent
          command: ["sh", "-c", "head -c 50m /dev/zero | tail > /dev/null; echo relatorio pronto; sleep 3600"]
          resources: { requests: { memory: 16Mi }, limits: { memory: 32Mi } }
`;
  await kubectl(['apply', '-f', '-'], { input: yaml });
  // Espera o primeiro OOMKilled acontecer de verdade.
  for (let i = 0; i < 30; i++) {
    const r = await kubectl(['-n', NS, 'get', 'pods', '-l', `app=${APP}`, '-o', 'jsonpath={..lastState.terminated.reason}']);
    if (r.stdout.includes('OOMKilled')) return;
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error('o cenário não gerou OOMKilled em 90 s');
}

async function main() {
  const pool = await criarPool();
  console.log(`Runbooks indexados: ${await indexar(pool)}`);
  await prepararIncidente();

  // 1. Alerta (como chegaria do Alertmanager).
  const alerta = { alertname: 'KubePodCrashLooping', namespace: NS, app: APP,
    descricao: 'container relatorios reiniciando repetidamente; último término com exit code 137' };
  marcar(`ALERTA ${alerta.alertname} em ${NS}/${APP}: ${alerta.descricao}`);

  // 2. RAG: recupera o runbook mais parecido com o alerta.
  const [q] = await embed([`${alerta.alertname} ${alerta.descricao}`]);
  const { rows } = await pool.query(`SELECT arquivo, titulo, conteudo, 1 - (embedding <=> $1::vector) AS score
    FROM m06.runbooks ORDER BY embedding <=> $1::vector LIMIT 3`, [vetor(q)]);
  rows.forEach((r) => console.log(`   candidato ${Number(r.score).toFixed(3)} · ${r.arquivo}`));
  // Post-mortens de incidentes parecidos (gerados em execuções anteriores) entram como contexto.
  const pms = await pool.query(`SELECT id, alerta, 1 - (embedding <=> $1::vector) AS score FROM m06.postmortems
    ORDER BY embedding <=> $1::vector LIMIT 1`, [vetor(q)]);
  pms.rows.forEach((p) => console.log(`   post-mortem anterior relacionado: #${p.id} ${p.alerta} (score ${Number(p.score).toFixed(3)})`));
  const top = rows[0];
  if (top.score < SCORE_MINIMO) {
    marcar(`nenhum runbook confiável (score ${Number(top.score).toFixed(2)}): escalado para o plantão`);
    return;
  }
  marcar(`runbook escolhido: ${top.arquivo} (score ${Number(top.score).toFixed(3)})`);
  const rb = parseRunbook(top.conteudo);
  const vars = { namespace: alerta.namespace, app: alerta.app };

  // 3. Verificação: o sintoma é mesmo o do runbook? (checagem determinística, não opinião do LLM)
  for (const linha of rb.secoes['Diagnóstico'].comandos) {
    const c = prepararComando(linha, vars);
    const r = await kubectl(c.argv);
    console.log(`   $ ${c.texto}\n     ${r.stdout.trim().split('\n').join('\n     ')}`);
  }
  const motivo = (await kubectl(['-n', NS, 'get', 'pods', '-l', `app=${APP}`, '-o', 'jsonpath={..lastState.terminated.reason}'])).stdout;
  if (top.arquivo.includes('oom') && !motivo.includes('OOMKilled')) {
    marcar('verificação NÃO confirmou o sintoma: escalado');
    return;
  }
  marcar(`verificação confirmou: lastState.terminated.reason=${motivo}`);

  // 4. Mitigação: allowlist → dry-run no servidor → aprovação humana → execução.
  for (const linha of rb.secoes['Mitigação'].comandos) {
    const c = prepararComando(linha, vars);
    if (c.erro) {
      marcar(`comando bloqueado pelo guardrail: ${c.erro}`);
      return;
    }
    const dry = await kubectl([...c.argv, '--dry-run=server']);
    if (!dry.ok) {
      marcar(`dry-run falhou: ${dry.stderr.trim()}`);
      return;
    }
    marcar(`dry-run ok: ${dry.stdout.trim()}`);
    const ap = await aprovar(c.texto);
    if (!ap.ok) {
      marcar('mitigação NEGADA pelo aprovador');
      return;
    }
    marcar(`aprovado por ${ap.quem}`);
    const r = await kubectl(c.argv);
    marcar(`MITIGAÇÃO executada: ${c.texto} → ${r.stdout.trim() || r.stderr.trim()}`);
  }

  // 5. Validação: comandos do runbook + checagem extra de que não houve novo OOM.
  for (const linha of rb.secoes['Validação'].comandos) {
    const c = prepararComando(linha, vars);
    const r = await kubectl(c.argv);
    marcar(`validação "${c.texto.split(' ').slice(3, 5).join(' ')}": ${r.ok ? 'ok' : 'FALHOU'} (${r.stdout.trim().split('\n').pop()})`);
  }
  await new Promise((res) => setTimeout(res, 20_000));
  const estado = (await kubectl(['-n', NS, 'get', 'pods', '-l', `app=${APP}`, '-o',
    'jsonpath={.items[0].status.containerStatuses[0].restartCount} restarts · estado={.items[0].status.containerStatuses[0].state}'])).stdout;
  const logs = (await kubectl(['-n', NS, 'logs', `deploy/${APP}`, '--tail=1'])).stdout.trim();
  marcar(`pós-mitigação (20 s depois): ${estado.includes('running') ? 'container rodando' : estado} · log: "${logs}"`);

  // 6. Post-mortem blameless a partir da timeline (o LLM redige; os fatos vêm do log do agente).
  // Na 1ª versão (max_tokens 420) o texto saiu cortado no meio da timeline e o modelo inventou fatos
  // ("nenhum dado perdido"). Agora: limite maior, timeline pronta (não pedimos ao LLM para reescrevê-la)
  // e regra explícita para marcar o que não sabemos.
  const { msg, ms, finishReason } = await chat([
    { role: 'system', content: 'Escreva um post-mortem BLAMELESS em Markdown, em português, com as seções: Resumo, Impacto, ' +
      'Causa raiz, O que funcionou, Ações de acompanhamento (com dono sugerido), Lições aprendidas. NÃO escreva a timeline ' +
      '(ela será anexada). Foque em sistemas e processos, nunca em pessoas. Use só os fatos dados; o que não estiver ' +
      'nos fatos, escreva "a confirmar". Máximo de 3 itens por seção.' },
    { role: 'user', content: `Serviço: deployment ${APP} no namespace ${NS} (ambiente de laboratório).\nRunbook usado: ${rb.titulo}\nTimeline:\n${timeline.join('\n')}` },
  ], { maxTokens: 700 });
  if (finishReason === 'length') console.log('⚠️ post-mortem cortado pelo max_tokens: aumente o limite');
  msg.content = `${msg.content.trim()}\n\n## Timeline (gerada pelo agente)\n\n${timeline.map((t) => `- ${t}`).join('\n')}\n`;
  const saida = path.join(AQUI, 'saida');
  await mkdir(saida, { recursive: true });
  await writeFile(path.join(saida, 'postmortem.md'), msg.content);
  console.log(`\n--- post-mortem (${(ms / 1000).toFixed(0)}s) → solucao/saida/postmortem.md ---\n${msg.content.trim()}\n---`);

  // 7. Lições aprendidas voltam para a base: o próximo incidente parecido recupera este post-mortem.
  //    Tabela separada dos runbooks: post-mortem é contexto para humanos, não roteiro executável.
  const [vp] = await embed([`Post-mortem ${alerta.alertname} ${APP}: ${msg.content.slice(0, 800)}`]);
  await pool.query(`INSERT INTO m06.postmortems (alerta, app, conteudo, embedding) VALUES ($1,$2,$3,$4::vector)`,
    [alerta.alertname, APP, msg.content, vetor(vp)]);
  console.log('Post-mortem indexado em m06.postmortems.');

  if (!process.argv.includes('--manter')) await kubectl(['delete', 'namespace', NS, '--wait=false']);
  await pool.end();
  console.log(resumoUso());
}

await main();
