// Correção HUMANA do componente gerado pelo LLM na execução registrada (execucao-registrada/paginacao.gerado.js).
// O que o LLM errou (pego pelos testes de aceitação e pela leitura do diff):
//  1. Faltava aria-current="page" na página atual (requisito 3 da spec).
//  2. Os botões ficaram FORA do <nav> e os dois depois da lista (spec: Anterior antes, Próxima depois).
// O resto (validação com RangeError, um link por página) estava certo e foi mantido.
export function renderPaginacao({ paginaAtual, totalPaginas }) {
  if (!Number.isInteger(paginaAtual) || !Number.isInteger(totalPaginas) || totalPaginas < 1 || paginaAtual < 1 || paginaAtual > totalPaginas) {
    throw new RangeError('paginaAtual deve ser um inteiro entre 1 e totalPaginas, e totalPaginas deve ser >= 1');
  }
  const itens = Array.from({ length: totalPaginas }, (_, i) => {
    const n = i + 1;
    const atual = n === paginaAtual ? ' aria-current="page"' : '';
    return `<li><a href="?pagina=${n}"${atual}>${n}</a></li>`;
  }).join('');
  return `<nav aria-label="Paginação">
  <button type="button"${paginaAtual === 1 ? ' disabled' : ''}>Anterior</button>
  <ul>${itens}</ul>
  <button type="button"${paginaAtual === totalPaginas ? ' disabled' : ''}>Próxima</button>
</nav>`;
}
