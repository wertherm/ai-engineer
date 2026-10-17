// HTML do recurso de UI (MCP Apps / MCP-UI) que o servidor MCP devolve em ui://tarefas/painel.
// Roda num <iframe> sandbox do host: não acessa a página-mãe. Para agir, manda uma mensagem
// JSON-RPC `tools/call` via postMessage e o HOST decide se repassa ao servidor MCP.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function htmlPainel(tarefas) {
  const itens = tarefas.map((t) => `<li>${esc(t.titulo)} ${t.concluida ? '<span>(concluída)</span>'
    : `<button type="button" data-id="${t.id}">Concluir ${esc(t.titulo)}</button>`}</li>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Painel de tarefas</title>
<style>body{font:14px system-ui;margin:12px;color:#222}button{margin-left:8px}</style></head>
<body><h1>Tarefas (${tarefas.length})</h1><ul>${itens || '<li>Nenhuma tarefa</li>'}</ul>
<script>
let seq = 0;
document.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', () => {
  // Formato do padrão MCP Apps: JSON-RPC sobre postMessage (o host faz o proxy para o servidor).
  window.parent.postMessage({ jsonrpc: '2.0', id: ++seq, method: 'tools/call',
    params: { name: 'concluir_tarefa', arguments: { id: Number(b.dataset.id) } } }, '*');
}));
</script></body></html>`;
}
