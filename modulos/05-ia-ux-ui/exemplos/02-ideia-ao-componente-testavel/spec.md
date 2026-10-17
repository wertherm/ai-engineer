# Spec: componente de paginação

Função `renderPaginacao({ paginaAtual, totalPaginas })`, exportada como ES module (`export function`),
que devolve uma **string HTML** (sem DOM, sem dependências):

1. Raiz: `<nav aria-label="Paginação">` contendo uma `<ul>`.
2. Um `<li>` por página, de 1 a `totalPaginas`, cada um com `<a href="?pagina=N">N</a>`.
3. A página atual tem `aria-current="page"` no `<a>` (e só ela).
4. Botões `<button>` "Anterior" (antes da lista) e "Próxima" (depois): `disabled` na primeira e na última página, respectivamente.
5. Lança `RangeError` se `paginaAtual` não for inteiro entre 1 e `totalPaginas`, ou se `totalPaginas < 1`.
