// Text-to-UI com verificação automática: descrição em linguagem natural -> LLM gera HTML/CSS ->
// Chrome headless renderiza, tira screenshot e o axe-core audita -> as violações voltam ao LLM
// numa 2ª iteração -> comparamos a nota antes/depois.
//
// Uso: node exemplos/01-text-to-ui-acessivel/gerar.js ["descrição da tela"]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { criarCliente, conversar, extrairCodigo, MODELO_CHAT } from '../../comum/config.js';
import { abrirNavegador } from '../../comum/navegador.js';
import { auditar, resumoParaLLM } from '../../comum/acessibilidade.js';

const DESCRICAO = process.argv[2] ??
  'Card de inscrição na newsletter: logo da empresa (imagem logo.png), título, campos nome e e-mail, ' +
  'checkbox "aceito receber e-mails" e botão Enviar. Textos auxiliares em cinza #9e9e9e sobre fundo branco, estilo minimalista.';

const SAIDA = join(import.meta.dirname, 'saida');
await mkdir(SAIDA, { recursive: true });

const cliente = criarCliente();
const browser = await abrirNavegador();

// Iteração 1: o prompt "ingênuo" que muita gente escreve. Nenhuma palavra sobre acessibilidade.
// "Markup primeiro, CSS curto no fim": com max_tokens baixo, um <style> enorme no início faz a
// resposta ser cortada antes do HTML (aconteceu na 1ª versão deste exemplo: nota 100 de um nada).
const sistema = 'Você gera UI. Responda SOMENTE com um bloco ```html: primeiro o markup, depois um <style> curto (no máximo 12 regras). Sem JavaScript, sem explicações.';
console.log(`Modelo: ${MODELO_CHAT}\nDescrição: ${DESCRICAO}\n`);

const r1 = await conversar(cliente, [
  { role: 'system', content: sistema },
  { role: 'user', content: DESCRICAO },
], { maxTokens: 900 });
const v1 = extrairCodigo(r1.texto, 'html');
await writeFile(join(SAIDA, 'v1.html'), v1);
const a1 = await auditar(browser, v1, { screenshot: join(SAIDA, 'v1.png') });
const aviso = (r) => (r.fim === 'length' ? ' [CORTADA por max_tokens]' : '');
console.log(`[v1] ${r1.segundos}s, ${r1.uso?.completion_tokens} tokens${aviso(r1)}, ${a1.elementos} elementos -> nota ${a1.nota}/100, ${a1.violacoes.length} regra(s) violada(s)`);
console.log(resumoParaLLM(a1.violacoes) || '  (nenhuma violação)');

// Iteração 2: devolvemos ao modelo o relatório do axe + o HTML anterior. É o mesmo ciclo de um
// code review: feedback concreto e verificável vence "por favor, faça acessível".
const r2 = await conversar(cliente, [
  { role: 'system', content: sistema },
  { role: 'user', content: DESCRICAO },
  { role: 'assistant', content: '```html\n' + v1 + '\n```' },
  { role: 'user', content:
    'Um auditor automático (axe-core, WCAG 2.1 AA) encontrou estes problemas:\n' + (resumoParaLLM(a1.violacoes) || '- nenhum') +
    // Na execução registrada sem a frase de PRIORIDADE, o modelo manteve #9e9e9e "conforme solicitado":
    // o pedido original de cor e a regra de contraste conflitavam e venceu o pedido. Diga qual vence.
    '\nCorrija TODOS. Acessibilidade tem PRIORIDADE sobre as cores pedidas na descrição: troque qualquer texto ' +
    '#9e9e9e (ou mais claro) por #595959. Mantenha: todo <input> com <label for>, <img> com alt, um <h1>. ' +
    'Devolva o fragmento completo corrigido.' },
], { maxTokens: 900 });
const v2 = extrairCodigo(r2.texto, 'html');
await writeFile(join(SAIDA, 'v2.html'), v2);
const a2 = await auditar(browser, v2, { screenshot: join(SAIDA, 'v2.png') });
console.log(`\n[v2] ${r2.segundos}s, ${r2.uso?.completion_tokens} tokens${aviso(r2)}, ${a2.elementos} elementos -> nota ${a2.nota}/100, ${a2.violacoes.length} regra(s) violada(s)`);
console.log(resumoParaLLM(a2.violacoes) || '  (nenhuma violação)');

await browser.close();
console.log(`\nNota: ${a1.nota} -> ${a2.nota} | arquivos em ${SAIDA} (v1/v2 .html e .png)`);
