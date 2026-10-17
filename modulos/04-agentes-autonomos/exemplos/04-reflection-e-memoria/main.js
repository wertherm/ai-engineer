// Reflection + memória em duas execuções (dois processos diferentes, nada em RAM entre eles):
//   node main.js 1  -> responde, se AUTOAVALIA (crítico), corrige e grava memória longa + episódica
//   node main.js 2  -> outra tarefa parecida: recupera memórias por embedding e já acerta de primeira
import { chat, criarPool, extrairJson, resumoUso } from '../../comum/llm.js';
import { prepararTabela, lembrar, recuperar } from './memoria.js';

const sessao = process.argv[2] ?? '1';
const pool = await criarPool();
await prepararTabela(pool, { zerar: sessao === '1' });

const CRITERIOS = 'no máximo 50 palavras; em tópicos começando com "- "; cita Postgres';

async function responder(tarefa, memorias) {
  // Memória contextual: o que foi recuperado entra no system prompt DESTA chamada (memória curta).
  const contexto = memorias.length ? `\nMemórias relevantes:\n${memorias.map((m) => `- (${m.tipo}) ${m.conteudo}`).join('\n')}` : '';
  const { msg } = await chat([
    { role: 'system', content: `Você é um assistente técnico. Responda em português.${contexto}` },
    { role: 'user', content: tarefa },
  ], { maxTokens: 120 });
  return msg.content.trim();
}

// Reflection: um "crítico" (o mesmo LLM com outro papel) avalia a resposta contra critérios explícitos.
async function criticar(resposta) {
  const { msg } = await chat([
    { role: 'system', content: `Você é um revisor rigoroso. Critérios: ${CRITERIOS}. Devolva só JSON {"aprovado": true|false, "problemas": ["..."]}.` },
    { role: 'user', content: resposta },
  ], { maxTokens: 80 });
  const veredito = extrairJson(msg.content);
  // Checagem determinística complementar: o LLM é bom crítico de estilo, ruim em contar palavras.
  const palavras = resposta.split(/\s+/).length;
  if (palavras > 50) { veredito.aprovado = false; veredito.problemas = [...(veredito.problemas ?? []), `tem ${palavras} palavras (máx. 50)`]; }
  return veredito;
}

async function revisar(resposta, problemas) {
  const { msg } = await chat([
    { role: 'system', content: `Reescreva a resposta corrigindo os problemas. Critérios: ${CRITERIOS}.` },
    { role: 'user', content: `Resposta:\n${resposta}\n\nProblemas: ${problemas.join('; ')}` },
  ], { maxTokens: 100 });
  return msg.content.trim();
}

if (sessao === '1') {
  await lembrar(pool, 'longa', 'O usuário prefere respostas curtas, em tópicos, e usa Node.js com Postgres.');
  const tarefa = 'Como devo guardar os logs de execução de um agente?';
  console.log(`[sessão 1] tarefa: ${tarefa}`);
  let resposta = await responder(tarefa, []); // de propósito sem memória: é o "primeiro dia"
  console.log(`\n[rascunho]\n${resposta}`);
  const v = await criticar(resposta);
  console.log(`\n[crítica] aprovado=${v.aprovado} problemas=${JSON.stringify(v.problemas)}`);
  if (!v.aprovado) {
    resposta = await revisar(resposta, v.problemas);
    console.log(`\n[revisada]\n${resposta}`);
    const v2 = await criticar(resposta);
    console.log(`\n[crítica 2] aprovado=${v2.aprovado} problemas=${JSON.stringify(v2.problemas)}`);
  }
  // Memória episódica: a lição da reflexão vira conhecimento para execuções futuras.
  const licao = `Episódio "${tarefa}": o rascunho foi ${v.aprovado ? 'aprovado' : `reprovado (${v.problemas.join('; ')})`}. Lição: responder ${CRITERIOS}.`;
  await lembrar(pool, 'episodica', licao);
  console.log(`\n[memória gravada] ${licao}`);
} else {
  const tarefa = 'Onde guardo o histórico de decisões dos meus agentes?';
  console.log(`[sessão 2] tarefa: ${tarefa}`);
  const memorias = await recuperar(pool, tarefa);
  console.log('\n[memórias recuperadas por embedding]');
  console.table(memorias);
  const resposta = await responder(tarefa, memorias);
  console.log(`\n[resposta já com memória]\n${resposta}`);
  const v = await criticar(resposta);
  console.log(`\n[crítica] aprovado=${v.aprovado} problemas=${JSON.stringify(v.problemas)}`);
}
const { rows } = await pool.query('SELECT tipo, count(*)::int AS n FROM m04.memorias GROUP BY tipo ORDER BY tipo');
console.log('\nMemórias no banco:', rows.map((r) => `${r.tipo}=${r.n}`).join(', '), '·', resumoUso());
await pool.end();
