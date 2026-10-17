export function renderPaginacao({ paginaAtual, totalPaginas }) {
    if (!Number.isInteger(paginaAtual) || !Number.isInteger(totalPaginas) || totalPaginas < 1 || paginaAtual < 1 || paginaAtual > totalPaginas) {
        throw new RangeError('paginaAtual deve ser um inteiro entre 1 e totalPaginas, e totalPaginas deve ser >= 1');
    }

    const html = `
<nav aria-label="Paginação">
    <ul>
        ${Array.from({ length: totalPaginas }, (_, i) => `<li><a href="?pagina=${i + 1}">${i + 1}</a></li>`).join('')}
    </ul>
</nav>
<button ${paginaAtual === 1 ? 'disabled' : ''}>Anterior</button>
<button ${paginaAtual === totalPaginas ? 'disabled' : ''}>Próxima</button>
`;

    return html;
}
