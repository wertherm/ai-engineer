// Testes de ACEITAÇÃO escritos por um humano a partir da spec (não do código gerado).
// São o "portão": o código do LLM só entra se passar aqui, independentemente dos testes que o
// próprio LLM escreveu (que podem estar errados do mesmo jeito que o código).
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Por padrão testa o que o LLM gerou; COMPONENTE=./correcao-humana/paginacao.js testa a versão corrigida.
const { renderPaginacao } = await import(process.env.COMPONENTE ?? './gerado/paginacao.js');

test('nav com aria-label e um link por página', () => {
  const html = renderPaginacao({ paginaAtual: 2, totalPaginas: 3 });
  assert.match(html, /<nav[^>]*aria-label="Paginação"/);
  for (const n of [1, 2, 3]) assert.match(html, new RegExp(`href="\\?pagina=${n}"`));
});

test('só a página atual tem aria-current', () => {
  const html = renderPaginacao({ paginaAtual: 2, totalPaginas: 3 });
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(html, /<a[^>]*href="\?pagina=2"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\?pagina=2"/);
});

test('Anterior desabilitado na 1ª página e Próxima na última', () => {
  const primeira = renderPaginacao({ paginaAtual: 1, totalPaginas: 3 });
  assert.match(primeira, /<button[^>]*disabled[^>]*>\s*Anterior/);
  assert.doesNotMatch(primeira, /<button[^>]*disabled[^>]*>\s*Próxima/);
  const ultima = renderPaginacao({ paginaAtual: 3, totalPaginas: 3 });
  assert.match(ultima, /<button[^>]*disabled[^>]*>\s*Próxima/);
});

test('RangeError para entradas inválidas', () => {
  for (const args of [{ paginaAtual: 0, totalPaginas: 3 }, { paginaAtual: 4, totalPaginas: 3 }, { paginaAtual: 1.5, totalPaginas: 3 }, { paginaAtual: 1, totalPaginas: 0 }]) {
    assert.throws(() => renderPaginacao(args), RangeError, JSON.stringify(args));
  }
});
