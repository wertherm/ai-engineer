// Troubleshooting assistido com ReAct: o agente decide quais evidências coletar (describe, logs),
// raciocina sobre elas e devolve diagnóstico + correção sugerida. Nada é alterado no cluster.
import path from 'node:path';
import { chat, extrairJson, resumoUso } from '../../comum/llm.js';
import { kubectl } from '../../comum/shell.js';
import { NS, ferramentas, toolsSchema, classificarPorRegra } from './ferramentas.js';

const MAX_PASSOS = 3;
// Gabarito: a causa raiz plantada em cada pod (ver pods-quebrados.yaml).
const GABARITO = { checkout: 'CrashLoopBackOff', catalogo: 'ImagePullBackOff', relatorios: 'OOMKilled' };
const CATEGORIAS = ['CrashLoopBackOff', 'ImagePullBackOff', 'OOMKilled', 'Outro'];

const SYSTEM = `Você é um SRE fazendo troubleshooting de Kubernetes. Use as ferramentas para coletar evidências
(chame descrever_pod primeiro; logs_pod só se o container chegou a rodar). Use no máximo 2 ferramentas e então
responda SÓ com JSON: {"categoria": um de ${CATEGORIAS.join('|')}, "causa": "1 frase", "correcao": "1 frase com a ação concreta"}.`;

async function diagnosticar(pod) {
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Diagnostique o pod "${pod}".` }];
  const vistas = new Set();
  for (let passo = 1; passo <= MAX_PASSOS; passo++) {
    const { msg, ms } = await chat(messages, { tools: toolsSchema, maxTokens: 160 });
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      console.log(`   [resposta] ${(ms / 1000).toFixed(0)}s`);
      return extrairJson(msg.content);
    }
    for (const call of msg.tool_calls) {
      const nome = call.function.name;
      const args = JSON.parse(call.function.arguments || '{}');
      // Guarda anti-loop: o qwen3.5:4b repetia describe → logs → describe → logs. Chamada repetida
      // não executa de novo: devolve um lembrete para concluir (cada volta custa minutos na CPU).
      const chave = `${nome}:${JSON.stringify(args)}`;
      if (vistas.has(chave)) {
        console.log(`   [ação ${passo}] ${nome} repetida → lembrete para concluir`);
        messages.push({ role: 'tool', tool_call_id: call.id, content: 'Você já tem esta evidência. Responda agora com o JSON.' });
        continue;
      }
      vistas.add(chave);
      // Allowlist: o modelo só consegue chamar o que está na toolbox (todas read-only).
      const saida = ferramentas[nome]
        ? await ferramentas[nome].executar(args).catch((e) => `erro: ${e.message}`)
        : `ferramenta desconhecida: ${nome}`;
      console.log(`   [ação ${passo}] ${nome}(${JSON.stringify(args)}) ${(ms / 1000).toFixed(0)}s → ${saida.length} chars`);
      messages.push({ role: 'tool', tool_call_id: call.id, content: saida });
    }
  }
  // Orçamento estourado: força a conclusão sem mais ferramentas (evita runaway loop).
  messages.push({ role: 'user', content: 'Sem mais ferramentas. Conclua agora com o JSON.' });
  const { msg } = await chat(messages, { maxTokens: 160 });
  return extrairJson(msg.content);
}

async function main() {
  // 1. Prepara o cenário: namespace próprio + 3 pods quebrados de propósito.
  await kubectl(['create', 'namespace', NS]);
  await kubectl(['-n', NS, 'apply', '-f', path.join(import.meta.dirname, 'pods-quebrados.yaml')]);
  console.log('Aguardando os pods falharem (60 s)...');
  await new Promise((r) => setTimeout(r, 60_000));
  console.log((await kubectl(['-n', NS, 'get', 'pods'])).stdout);

  let acertosLlm = 0;
  let acertosRegra = 0;
  for (const [pod, esperado] of Object.entries(GABARITO)) {
    console.log(`── ${pod} (gabarito: ${esperado})`);
    const regra = await classificarPorRegra(pod);
    const d = await diagnosticar(pod).catch((e) => ({ categoria: 'erro', causa: e.message, correcao: '-' }));
    const okLlm = d.categoria === esperado;
    acertosLlm += okLlm;
    acertosRegra += regra === esperado;
    console.log(`   regra    : ${regra} ${regra === esperado ? '✓' : '✗'}`);
    console.log(`   agente   : ${d.categoria} ${okLlm ? '✓' : '✗'}`);
    console.log(`   causa    : ${d.causa}`);
    console.log(`   correção : ${d.correcao}\n`);
  }
  const n = Object.keys(GABARITO).length;
  console.log(`Acerto da categoria: agente ${acertosLlm}/${n} · regras ${acertosRegra}/${n}`);

  if (!process.argv.includes('--manter')) {
    await kubectl(['delete', 'namespace', NS, '--wait=false']);
    console.log(`Namespace ${NS} removido (use --manter para inspecionar).`);
  }
  console.log(resumoUso());
}

await main();
