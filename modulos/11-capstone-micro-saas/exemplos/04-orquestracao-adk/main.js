// Orquestração multiagente com o Google ADK (@google/adk 2.3.0) rodando no LLM LOCAL:
//   START -> pesquisador (LlmAgent + tool buscar_politicas) -> redator (LlmAgent) -> verificar (função)
// Cada agente pode usar um modelo diferente (MODELO_PESQUISADOR / MODELO_REDATOR): é o "múltiplos LLMs".
// O nó final é CÓDIGO, não LLM: confere se as citações do redator são arquivos que o pesquisador leu.
//   node exemplos/04-orquestracao-adk/main.js [tenant] ["pergunta"]
import { FunctionTool, InMemoryRunner, LlmAgent, setLogLevel, LogLevel, Workflow } from '@google/adk';
import { z } from 'zod';
import { OllamaLlm } from './ollama-llm.js';
import { config } from '../../app/src/config.js';
import { criarPool } from '../../app/src/db.js';
import { criarLlm } from '../../app/src/llm.js';
import { criarServico } from '../../app/src/servico.js';

setLogLevel(LogLevel.ERROR); // esconde o aviso "Workflow is experimental" (está registrado no README)
const tenantId = process.argv[2] ?? 'acme';
const pergunta = process.argv[3] ?? 'Quantos dias por semana posso trabalhar de casa e quanto recebo de auxílio para isso?';

const pool = criarPool();
const servico = criarServico({ pool, llm: criarLlm() });
const { rows: [tenant] } = await pool.query('SELECT id, nome FROM m11.tenants WHERE id = $1', [tenantId]);
const lidos = new Set(); // arquivos que a tool devolveu: base da verificação de citações

// Tool do ADK com schema zod: o ADK gera a declaração e VALIDA os argumentos antes de executar.
const buscarPoliticas = new FunctionTool({
  name: 'buscar_politicas',
  description: 'Busca trechos das políticas internas da empresa por assunto.',
  parameters: z.object({ consulta: z.string().describe('assunto curto, ex.: "auxílio home office"') }),
  execute: async ({ consulta }) => {
    const trechos = await servico.buscar(tenant, consulta, { k: 3, canal: 'adk' });
    trechos.forEach((t) => lidos.add(t.fonte));
    return { trechos: trechos.map((t) => ({ arquivo: t.fonte, texto: t.conteudo })) };
  },
});

const pesquisador = new LlmAgent({
  name: 'pesquisador',
  description: 'Encontra nas políticas os fatos necessários para a pergunta.',
  model: new OllamaLlm({ model: `ollama/${process.env.MODELO_PESQUISADOR ?? config.modeloChat}`, maxTokens: 150 }),
  instruction:
    'Chame buscar_politicas UMA vez com o assunto principal da pergunta. Depois copie TODOS os fatos dos trechos ' +
    'que tenham relação com qualquer parte da pergunta, um por linha, com o arquivo entre colchetes, ' +
    'ex.: "- regra X [arquivo.md]". Não responda a pergunta.',
  tools: [buscarPoliticas],
  outputKey: 'evidencias', // a saída vai para o estado da sessão, lida pelo próximo agente
});

const redator = new LlmAgent({
  name: 'redator',
  description: 'Escreve a resposta final ao colaborador a partir das evidências.',
  model: new OllamaLlm({ model: `ollama/${process.env.MODELO_REDATOR ?? config.modeloChat}`, maxTokens: 120 }),
  // {pergunta} e {evidencias} são lidos do ESTADO da sessão (templating do ADK).
  instruction:
    'Pergunta do colaborador: {pergunta}\nEvidências:\n{evidencias}\n\nResponda em português, em até 2 frases, usando só ' +
    'as evidências e mantendo o arquivo entre colchetes após cada fato. Se as evidências não cobrem uma parte da ' +
    'pergunta, diga que não encontrou essa parte; nunca complete com suposições.',
  outputKey: 'resposta',
});

// Nó de função: recebe (contexto, saída do nó anterior). Determinístico, sem custo de tokens.
function verificar(_ctx, resposta) {
  const citados = [...String(resposta).matchAll(/\[([\w.-]+\.md)\]/g)].map((m) => m[1]);
  const ok = citados.length > 0 && citados.every((f) => lidos.has(f));
  return { verificado: ok, citados, lidos: [...lidos] };
}

const fluxo = new Workflow({ name: 'politicas_adk', edges: [['START', pesquisador, redator, verificar]] });
const runner = new InMemoryRunner({ agent: fluxo, appName: 'politicas' });
const sessao = await runner.sessionService.createSession({ appName: 'politicas', userId: tenant.id, state: { pergunta } });

console.log(`Tenant: ${tenant.nome}\nPergunta: ${pergunta}\n`);
const t0 = Date.now();
let tAnterior = t0;
for await (const ev of runner.runAsync({ userId: tenant.id, sessionId: sessao.id, newMessage: { role: 'user', parts: [{ text: pergunta }] } })) {
  const dt = (((Date.now() - tAnterior) / 1000).toFixed(1) + 's').padStart(7);
  tAnterior = Date.now();
  for (const p of ev.content?.parts ?? []) {
    if (p.functionCall) console.log(`${dt} [${ev.author}] chama ${p.functionCall.name}(${JSON.stringify(p.functionCall.args)})`);
    else if (p.functionResponse) console.log(`${dt} [${ev.author}] tool devolveu ${p.functionResponse.response.trechos?.map((t) => t.arquivo).join(', ')}`);
    else if (p.text) console.log(`${dt} [${ev.author}] ${p.text.trim().replace(/\n/g, '\n          ')}`);
  }
  if (ev.errorMessage) console.log(`[erro] ${ev.errorMessage}`);
}
const fim = await runner.sessionService.getSession({ appName: 'politicas', userId: tenant.id, sessionId: sessao.id });
console.log(`\nestado final: ${JSON.stringify(Object.keys(fim.state))} · total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await pool.end();
