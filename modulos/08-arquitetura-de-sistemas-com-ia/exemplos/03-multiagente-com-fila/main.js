// Exemplo 03 · Multi-agente: Sequential, Parallel e Supervisor, conversando por fila e chamadas assíncronas,
// com falha de nó, retry/timeout, DLQ e uma fila durável no Postgres (LISTEN/NOTIFY, schema m08).
import { FilaMemoria, FilaPostgres } from './fila.js';
import { agentes, instavel, lento, comResiliencia } from './agentes.js';
import { config } from '../../comum/llm.js';

const PEDIDOS = ['Padaria Sol: antecipar R$ 12.000', 'ACME: antecipar R$ 80.000'];
const log = (s) => console.log(s);

// Monta um pipeline sobre QUALQUER fila: cada agente lê de um tópico e publica no próximo.
// Os agentes não se conhecem (Loose Coupling); só conhecem o nome do tópico de saída.
async function pipelineSequencial(fila, etapas, pedidos) {
  const resultados = [];
  const fim = new Promise((resolve) => {
    fila.consumir('saida', async (estado) => { resultados.push(estado); if (resultados.length === pedidos.length) resolve(); });
  });
  for (const [i, [nome, fn]] of etapas.entries()) {
    const destino = etapas[i + 1]?.[0] ?? 'saida';
    await fila.consumir(nome, async (estado) => fila.publicar(destino, await fn(estado)));
  }
  for (const pedido of pedidos) await fila.publicar(etapas[0][0], { pedido });
  await Promise.race([fim, new Promise((r) => setTimeout(r, 3000))]);
  return resultados;
}

log('== 1. Sequential (fila em memória): extrator -> risco -> fraude -> redator ==');
{
  const fila = new FilaMemoria({ maxTentativas: 3 });
  // O agente de fraude falha 2 vezes: a própria fila reentrega com backoff (at-least-once).
  const etapas = [['extrator', agentes.extrator], ['risco', agentes.risco], ['fraude', instavel(agentes.fraude, 2)], ['redator', agentes.redator]];
  const t0 = performance.now();
  const r = await pipelineSequencial(fila, etapas, PEDIDOS);
  r.forEach((e) => log(`  ${e.parecer}`));
  log(`  tempo total: ${Math.round(performance.now() - t0)} ms · DLQ: ${fila.dlq.length} mensagens`);
  await fila.fechar();
}

log('\n== 2. Parallel (fan-out/fan-in): risco e fraude ao mesmo tempo ==');
{
  const t0 = performance.now();
  const base = await agentes.extrator({ pedido: PEDIDOS[1] });
  // allSettled: uma falha não derruba as outras análises; o agregador decide o que fazer com a parcial.
  const [risco, fraude] = await Promise.allSettled([
    comResiliencia('risco', agentes.risco, base),
    comResiliencia('fraude', lento(agentes.fraude, 500), base, { tentativas: 2, timeoutMs: 100, log }),
  ]);
  const estado = { ...base, ...(risco.value ?? {}), fraude: fraude.status === 'fulfilled' ? fraude.value.fraude : 'indisponivel' };
  log(`  risco=${estado.risco} fraude=${estado.fraude} (resultado parcial, degradação graciosa)`);
  log(`  ${(await agentes.redator(estado)).parecer} · ${Math.round(performance.now() - t0)} ms`);
}

log('\n== 3. Supervisor: decide o próximo agente a partir do estado ==');
{
  // Política do supervisor. Em produção, pode ser um LLM escolhendo a próxima ferramenta/agente;
  // aqui é uma função pura para ficar testável e barata.
  const proximo = (e) => (!e.cliente ? 'extrator' : !e.risco ? 'risco' : e.risco === 'alto' && !e.fraude ? 'fraude' : !e.parecer ? 'redator' : null);
  const time = { ...agentes, fraude: instavel(agentes.fraude, 1) };
  for (const pedido of PEDIDOS) {
    let estado = { pedido };
    const trilha = [];
    for (let passo = 0, nome; (nome = proximo(estado)) && passo < 6; passo++) { // limite de passos = guarda contra loop
      trilha.push(nome);
      estado = await comResiliencia(nome, time[nome], estado, { log });
    }
    log(`  ${trilha.join(' -> ')} => ${estado.parecer}`);
  }
}

log('\n== 4. Sequential sobre fila DURÁVEL no Postgres (LISTEN/NOTIFY, m08.mensagens) ==');
{
  const fila = new FilaPostgres({ connectionString: config.databaseUrl, maxTentativas: 2 });
  await fila.iniciar();
  // O redator está quebrado de vez: depois de 2 tentativas a mensagem vai para 'dlq', sem travar o resto.
  const quebrado = async () => { throw new Error('redator fora do ar'); };
  const etapas = [['extrator', agentes.extrator], ['risco', agentes.risco], ['redator', quebrado]];
  await pipelineSequencial(fila, etapas, PEDIDOS.slice(0, 1));
  const { rows } = await fila.pool.query(`SELECT topico, status, tentativas, coalesce(erro, '') AS erro FROM m08.mensagens ORDER BY id`);
  rows.forEach((r) => log(`  ${r.topico.padEnd(9)} ${r.status.padEnd(9)} tentativas=${r.tentativas} ${r.erro}`));
  await fila.fechar();
}
