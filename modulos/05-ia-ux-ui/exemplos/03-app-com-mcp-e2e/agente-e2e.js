// Agente de teste E2E: recebe um OBJETIVO em linguagem natural, descobre as tools MCP da app,
// pede ao LLM um PLANO de passos (saída estruturada) e o executa: Playwright age na UI pelos
// rótulos acessíveis e o MCP prepara e confere o estado. 1 chamada ao LLM (plan-and-execute; uma 2ª
// só se o plano vier inválido);
// o loop ReAct passo a passo está no módulo 04, mas custa 1 chamada por passo em CPU.
// Uso: node exemplos/03-app-com-mcp-e2e/agente-e2e.js ["objetivo do teste"]
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { criarCliente, PADRAO, MODELO_CHAT } from '../../comum/config.js';
import { abrirNavegador } from '../../comum/navegador.js';
import { criarApp } from './app.js';
import { criarEstado } from './estado.js';
import { conectarMcp, chamar } from './cliente-mcp.js';

const OBJETIVO = process.argv[2] ??
  'Partindo de uma lista vazia, adicione pela interface a tarefa "Pagar boleto", confirme pelo MCP que ela existe, ' +
  'marque-a como concluída pela interface e confirme pelo MCP que ficou concluída.';
const PORT = Number(process.env.PORT ?? 30510);
const BASE = `http://127.0.0.1:${PORT}`;

// Esquema plano (todos os campos string) de propósito: modelos pequenos erram menos com ele do
// que com uniões discriminadas.
const Passo = z.object({
  tipo: z.enum(['mcp', 'preencher', 'clicar', 'marcar', 'verificar']),
  alvo: z.string().describe('tool MCP, rótulo do campo/checkbox ou nome do botão'),
  valor: z.string().describe('texto a digitar, JSON de argumentos da tool ou texto esperado; "" se não usar'),
});
const Plano = z.object({ passos: z.array(Passo).min(1).max(10) });

const http = criarApp(criarEstado()).listen(PORT, '127.0.0.1');
await new Promise((r) => http.once('listening', r));
const mcp = await conectarMcp(BASE);
const { tools } = await mcp.listTools();
const catalogo = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
console.log(`Objetivo: ${OBJETIVO}\nTools MCP descobertas: ${tools.map((t) => t.name).join(', ')}\n`);

const cliente = criarCliente();
const nomesTools = new Set(tools.map((t) => t.name));

// Validação semântica do plano (o JSON Schema garante o formato, não o sentido). Na 1ª execução
// registrada (execucao-registrada-1.txt) o modelo pôs o TEXTO esperado em "alvo" num passo
// "verificar"; o executor tentou chamar a tool "Pagar boleto". Agora isso volta ao LLM como erro.
function errosDoPlano(plano) {
  return plano.passos.flatMap((p, i) => [
    ...(['mcp', 'verificar'].includes(p.tipo) && !nomesTools.has(p.alvo)
      ? [`passo ${i + 1}: "${p.alvo}" não é uma tool; em "${p.tipo}" o alvo deve ser uma de: ${[...nomesTools].join(', ')}`] : []),
    ...(['preencher', 'verificar'].includes(p.tipo) && !p.valor.trim() ? [`passo ${i + 1}: "${p.tipo}" exige "valor" não vazio`] : []),
  ]);
}

const mensagens = [
  { role: 'system', content:
    'Você planeja testes E2E. Tipos de passo:\n' +
    '- mcp: chama a tool "alvo" com argumentos JSON em "valor" (ex.: "{}")\n' +
    '- preencher: digita "valor" no campo de rótulo "alvo" (o campo da tela chama "Nova tarefa")\n' +
    '- clicar: clica no botão de nome "alvo" (o botão da tela chama "Adicionar")\n' +
    '- marcar: marca o checkbox de rótulo "alvo" (o rótulo é o título da tarefa)\n' +
    '- verificar: chama a tool "alvo" (ex.: listar_tarefas) e exige que o resultado contenha o texto "valor"\n' +
    `Tools MCP:\n${catalogo}\nResultados do listar_tarefas são JSON como {"id":1,"titulo":"X","concluida":false}.\n` +
    // Few-shot: um exemplo de plano para OUTRO objetivo mostra o papel de cada campo melhor que regras.
    'Exemplo para "adicione Ler livro, conclua e confira": {"passos":[{"tipo":"mcp","alvo":"resetar_estado","valor":"{}"},' +
    '{"tipo":"preencher","alvo":"Nova tarefa","valor":"Ler livro"},{"tipo":"clicar","alvo":"Adicionar","valor":""},' +
    '{"tipo":"verificar","alvo":"listar_tarefas","valor":"Ler livro"},{"tipo":"marcar","alvo":"Ler livro","valor":""},' +
    '{"tipo":"verificar","alvo":"listar_tarefas","valor":"\\"titulo\\":\\"Ler livro\\",\\"concluida\\":true"}]}' },
  { role: 'user', content: OBJETIVO },
];
let plano;
for (let tentativa = 1; tentativa <= 2; tentativa++) {
  const inicio = Date.now();
  const resp = await cliente.chat.completions.create({
    ...PADRAO, model: MODELO_CHAT, max_tokens: 400,
    response_format: zodResponseFormat(Plano, 'plano'),
    messages: mensagens,
  });
  const texto = resp.choices[0].message.content;
  plano = Plano.parse(JSON.parse(texto));
  const erros = errosDoPlano(plano);
  console.log(`Plano do LLM, tentativa ${tentativa} (${Math.round((Date.now() - inicio) / 1000)}s)${erros.length ? ' - REJEITADO' : ''}:`);
  plano.passos.forEach((p, i) => console.log(`  ${i + 1}. ${p.tipo} ${JSON.stringify(p.alvo)} ${p.valor ? JSON.stringify(p.valor) : ''}`));
  if (!erros.length) break;
  erros.forEach((e) => console.log(`  ! ${e}`));
  if (tentativa === 2) throw new Error('Plano inválido após 2 tentativas');
  mensagens.push({ role: 'assistant', content: texto }, { role: 'user', content: `Plano inválido:\n${erros.join('\n')}\nCorrija e responda o plano completo.` });
}

// Executor determinístico: o LLM decide O QUE fazer, o código decide COMO (e com quais limites).
const browser = await abrirNavegador();
const page = await browser.newPage();
await page.goto(BASE);
let falhas = 0;
for (const [i, p] of plano.passos.entries()) {
  const rotulo = `  passo ${i + 1} (${p.tipo} ${p.alvo})`;
  try {
    if (p.tipo === 'mcp') await chamar(mcp, p.alvo, p.valor ? JSON.parse(p.valor) : {});
    if (p.tipo === 'preencher') await page.getByLabel(p.alvo, { exact: true }).fill(p.valor, { timeout: 5000 });
    if (p.tipo === 'clicar') await page.getByRole('button', { name: p.alvo }).click({ timeout: 5000 });
    if (p.tipo === 'marcar') await page.getByLabel(p.alvo, { exact: true }).check({ timeout: 5000 });
    if (p.tipo === 'mcp' && p.alvo === 'resetar_estado') await page.reload();
    if (['clicar', 'marcar'].includes(p.tipo)) await page.waitForTimeout(300); // UI chama a API e redesenha
    if (p.tipo === 'verificar') {
      // Compara sem espaços dos DOIS lados ("concluida": true == "concluida":true). Na execução
      // registrada 2 só o esperado era normalizado e "Pagar boleto" virou "Pagarboleto": bug do executor.
      const semEspaco = (x) => x.replace(/\s+/g, '');
      const obtido = JSON.stringify(await chamar(mcp, p.alvo, {}));
      if (!semEspaco(obtido).includes(semEspaco(p.valor))) throw new Error(`esperava "${p.valor}" em ${obtido}`);
    }
    console.log(`${rotulo}: ok`);
  } catch (e) {
    falhas++;
    console.log(`${rotulo}: FALHOU -> ${e.message.split('\n')[0]}`);
  }
}
const final = await chamar(mcp, 'listar_tarefas');
console.log(`\nEstado final (via MCP): ${JSON.stringify(final)}`);
console.log(falhas ? `Resultado: ${falhas} passo(s) falharam` : 'Resultado: fluxo E2E aprovado');
await browser.close();
await mcp.close();
http.close();
process.exitCode = falhas ? 1 : 0;
