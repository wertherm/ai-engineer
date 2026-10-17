// Da ideia ao componente testável: spec curta -> LLM gera o componente -> LLM gera um teste
// (só a partir da spec) -> rodamos os testes do LLM E os testes de aceitação humanos.
// Uso: node exemplos/02-ideia-ao-componente-testavel/main.js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { criarCliente, conversar, extrairCodigo } from '../../comum/config.js';

const AQUI = import.meta.dirname;
const GERADO = join(AQUI, 'gerado');
await mkdir(GERADO, { recursive: true });
const spec = await readFile(join(AQUI, 'spec.md'), 'utf8');
const cliente = criarCliente();

// Prompt engineering para código: papel + restrições de formato + a spec inteira + "sem explicação".
// Restrições explícitas (ES module, sem dependências, nome exato) evitam o clássico "require()".
const r1 = await conversar(cliente, [
  { role: 'system', content: 'Você é um dev front-end sênior. Responda só com um bloco ```js. JavaScript moderno, ES module, sem dependências, sem comentários longos.' },
  { role: 'user', content: `Implemente exatamente esta spec em um arquivo paginacao.js:\n\n${spec}` },
], { maxTokens: 500 });
await writeFile(join(GERADO, 'paginacao.js'), extrairCodigo(r1.texto, 'js') + '\n');
console.log(`[componente] ${r1.segundos}s, ${r1.uso?.completion_tokens} tokens -> gerado/paginacao.js`);

// O teste é gerado SÓ da spec (sem mostrar o código): assim ele não "copia" os bugs da implementação.
const r2 = await conversar(cliente, [
  { role: 'system', content: 'Você escreve testes. Responda só com um bloco ```js usando node:test e node:assert/strict. Sem dependências.' },
  // Lição da 1ª execução registrada: sem "não crie mock", o modelo escreveu um MOCK do componente e
  // testou o mock (não testa nada); e 500 tokens cortaram o arquivo no meio (SyntaxError).
  { role: 'user', content: `Escreva 4 testes CURTOS (1 a 3 asserts cada) para esta spec. Importe o módulo real com: import { renderPaginacao } from './paginacao.js'; NÃO crie mock nem reimplemente a função.\n\n${spec}` },
], { maxTokens: 700 });
await writeFile(join(GERADO, 'paginacao.test.js'), extrairCodigo(r2.texto, 'js') + '\n');
console.log(`[teste do LLM] ${r2.segundos}s, ${r2.uso?.completion_tokens} tokens -> gerado/paginacao.test.js`);

// Executa de verdade. O resumo do node:test vem nas linhas "ℹ pass N" / "ℹ fail N".
function rodar(rotulo, arquivo) {
  const r = spawnSync(process.execPath, ['--test', arquivo], { encoding: 'utf8' });
  const saida = r.stdout + r.stderr;
  const resumo = ['pass', 'fail'].map((k) => `${k} ${saida.match(new RegExp(`ℹ ${k} (\\d+)`))?.[1] ?? '?'}`).join(', ');
  console.log(`\n== ${rotulo}: ${resumo}`);
  for (const linha of saida.split('\n').filter((l) => /^\s*✖ /.test(l)).slice(0, 6)) console.log(linha);
  return r.status === 0;
}
const okLLM = rodar('testes gerados pelo LLM', join(GERADO, 'paginacao.test.js'));
const okHumano = rodar('testes de aceitação (humanos)', join(AQUI, 'aceitacao.test.js'));
process.exitCode = okHumano ? 0 : 1;
console.log(`\nResultado: testes do LLM ${okLLM ? 'passaram' : 'FALHARAM'}; aceitação ${okHumano ? 'APROVADA' : 'REPROVADA (veja a seção "Correção humana" do README)'}`);
