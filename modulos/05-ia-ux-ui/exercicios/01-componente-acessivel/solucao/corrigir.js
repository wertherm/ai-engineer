// Solução do exercício 01: laço "auditar -> pedir correção ao LLM -> auditar" até nota 100
// ou até esgotar as tentativas. Uso: node exercicios/01-componente-acessivel/solucao/corrigir.js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { criarCliente, conversar, extrairCodigo } from '../../../comum/config.js';
import { abrirNavegador } from '../../../comum/navegador.js';
import { auditar, resumoParaLLM } from '../../../comum/acessibilidade.js';

const MAX_TENTATIVAS = Number(process.env.MAX_TENTATIVAS ?? 3);
const SAIDA = join(import.meta.dirname, 'saida');
await mkdir(SAIDA, { recursive: true });

let html = await readFile(join(import.meta.dirname, '..', 'componente-ruim.html'), 'utf8');
const cliente = criarCliente();
const browser = await abrirNavegador();

let a = await auditar(browser, html);
console.log(`[original] nota ${a.nota}/100 (${a.elementos} elementos)\n${resumoParaLLM(a.violacoes)}`);

for (let i = 1; i <= MAX_TENTATIVAS && a.nota < 100; i++) {
  // Cada rodada leva o HTML ATUAL + as violações ATUAIS (não o histórico inteiro): o contexto do
  // modelo local é de 4096 tokens e o histórico só cresceria.
  const r = await conversar(cliente, [
    { role: 'system', content: 'Você corrige acessibilidade de HTML. Mantenha o visual e a função. Responda só com um bloco ```html com o componente completo (markup + <style>).' },
    { role: 'user', content: `Componente:\n\`\`\`html\n${html}\n\`\`\`\nProblemas (axe-core + checagens próprias):\n${resumoParaLLM(a.violacoes)}\n` +
      'Regras: botão de ícone precisa de aria-label; imagem decorativa usa alt=""; nada de div clicável (use <button type="button">); ' +
      'campo precisa de <label for> visível; texto com contraste >= 4.5:1 (ex.: #595959 sobre branco).' },
  ], { maxTokens: 700 });
  const candidato = extrairCodigo(r.texto, 'html');
  const b = await auditar(browser, candidato);
  console.log(`\n[tentativa ${i}] ${r.segundos}s${r.fim === 'length' ? ' [CORTADA]' : ''} -> nota ${b.nota}/100 (${b.elementos} elementos)`);
  if (b.violacoes.length) console.log(resumoParaLLM(b.violacoes));
  // Só aceitamos a nova versão se ela não piorou, tem conteúdo e NÃO foi cortada por max_tokens. Na
  // execução registrada (max_tokens 450) a resposta veio cortada no meio do <style> e mesmo assim
  // tirou 100: o navegador "perdoa" CSS truncado, mas você não deveria mandar isso para o repositório.
  if (r.fim !== 'length' && b.elementos >= 3 && b.nota >= a.nota) { html = candidato; a = b; } else console.log('  (rejeitada: cortada, piorou ou veio vazia)');
}

await writeFile(join(SAIDA, 'componente-corrigido.html'), html);
await browser.close();
console.log(`\nResultado final: nota ${a.nota}/100 -> ${join('saida', 'componente-corrigido.html')}`);
process.exitCode = a.nota === 100 ? 0 : 1;
