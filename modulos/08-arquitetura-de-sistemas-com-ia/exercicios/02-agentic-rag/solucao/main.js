// Solução do exercício 02 · Agentic RAG: o MODELO decide se precisa buscar, o que buscar e quando parar.
// Reaproveita o corpus e a busca híbrida do exemplo 03 (mesmo schema m08).
import { criarPool, chat, embed, vetor } from '../../../comum/llm.js';
import { indexar, comInstrucao } from '../../../exemplos/04-padroes-de-rag/corpus.js';
import { buscaHibrida } from '../../../exemplos/04-padroes-de-rag/buscas.js';

const pool = await criarPool();
await indexar(pool);

const TOOLS = [{
  type: 'function',
  function: {
    name: 'buscar_documentos',
    description: 'Busca nas políticas internas e nos produtos financeiros da empresa (CCB, TAC, antecipação, home office, senhas...). Use só para fatos da empresa.',
    parameters: { type: 'object', properties: { consulta: { type: 'string', description: 'termos de busca' } }, required: ['consulta'] },
  },
}];

async function buscar(consulta) {
  const [e] = await embed([comInstrucao(consulta)]);
  const ids = await buscaHibrida(pool, consulta, vetor(e), 2);
  const { rows } = await pool.query('SELECT id, texto FROM m08.rag_docs WHERE id = ANY($1)', [ids]);
  return rows.map((r) => `[${r.id}] ${r.texto}`).join('\n');
}

const SISTEMA = 'Você é o assistente da empresa. Para fatos sobre a empresa, chame buscar_documentos. ' +
  'Para conhecimento geral ou conta, responda direto, sem ferramenta. Responda em 1 frase e cite [id] quando usar documento.';

// Guardrail determinístico: na 1ª versão desta solução o modelo respondeu "CCB-78" SEM buscar e inventou
// o prazo. Código de produto/política (LETRAS-NÚMEROS) é sinal forte de fato interno: aí a busca é obrigatória
// e não fica a critério do LLM (decision framework do doc 01: regra onde a regra é confiável).
const exigeBusca = (pergunta) => /\b[A-Z]{2,}(-[A-Z]+)?-\d+\b/.test(pergunta);

async function agente(pergunta, maxPassos = 3) {
  const msgs = [{ role: 'system', content: SISTEMA }, { role: 'user', content: pergunta }];
  const trilha = [];
  const recuperados = new Set();
  let tokens = 0;
  if (exigeBusca(pergunta)) {
    const ctx = await buscar(pergunta);
    ctx.match(/\[(\w+)\]/g).forEach((m) => recuperados.add(m.slice(1, -1)));
    trilha.push(`busca forçada pela regra ("${pergunta}")`);
    msgs.push({ role: 'user', content: `Documentos recuperados:\n${ctx}` });
  }
  for (let passo = 0; passo < maxPassos; passo++) {
    // No último passo não oferecemos tools: força a resposta final (guarda contra loop de buscas).
    const r = await chat(msgs, { tools: passo < maxPassos - 1 ? TOOLS : undefined, maxTokens: 70 });
    tokens += r.usage?.total_tokens ?? 0;
    const chamadas = r.msg.tool_calls ?? [];
    if (chamadas.length === 0) {
      // Checagem de citação: todo [id] citado tem de ter sido recuperado; senão é fonte inventada.
      const citados = [...r.texto.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
      const fonteOk = citados.every((id) => recuperados.has(id));
      return { resposta: r.texto, trilha, tokens, fonteOk };
    }
    msgs.push(r.msg);
    for (const c of chamadas) {
      const { consulta } = JSON.parse(c.function.arguments);
      trilha.push(`buscar("${consulta}")`);
      const ctx = await buscar(consulta);
      (ctx.match(/\[(\w+)\]/g) ?? []).forEach((m) => recuperados.add(m.slice(1, -1)));
      msgs.push({ role: 'tool', tool_call_id: c.id, content: ctx });
    }
  }
  return { resposta: `(sem resposta em ${maxPassos} passos)`, trilha, tokens, fonteOk: false };
}

const PERGUNTAS = ['Quanto é 12 vezes 8?', 'Qual o prazo da CCB-78?', 'Posso trabalhar de casa quantos dias?'];
for (const p of PERGUNTAS) {
  const t0 = performance.now();
  const r = await agente(p);
  console.log(`\nP: ${p}`);
  console.log(`   decisão: ${r.trilha.length ? r.trilha.join(' -> ') : 'respondeu sem buscar'}`);
  console.log(`   R: ${r.resposta}`);
  console.log(`   citações válidas? ${r.fonteOk ? 'sim' : 'NÃO (fonte inventada)'}`);
  console.log(`   ${r.tokens} tokens · ${Math.round((performance.now() - t0) / 1000)} s`);
}
await pool.end();
