"""HTML do recurso de UI (MCP Apps) que o servidor MCP devolve em ui://tarefas/painel.

O HTML é gerado no servidor (Python); o <script> dentro dele roda no iframe sandbox do host e continua
JavaScript. Para agir, o iframe manda um JSON-RPC `tools/call` por postMessage e o HOST decide se
repassa ao servidor MCP.
"""

from html import escape


def html_painel(tarefas: list[dict]) -> str:
    itens = "".join(
        f"<li>{escape(t['titulo'])} " + ("<span>(concluída)</span>" if t["concluida"] else
        f'<button type="button" data-id="{t["id"]}">Concluir {escape(t["titulo"])}</button>') + "</li>"
        for t in tarefas)
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Painel de tarefas</title>
<style>body{{font:14px system-ui;margin:12px;color:#222}}button{{margin-left:8px}}</style></head>
<body><h1>Tarefas ({len(tarefas)})</h1><ul>{itens or '<li>Nenhuma tarefa</li>'}</ul>
<script>
let seq = 0;
document.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', () => {{
  // Formato do padrão MCP Apps: JSON-RPC sobre postMessage (o host faz o proxy para o servidor).
  window.parent.postMessage({{ jsonrpc: '2.0', id: ++seq, method: 'tools/call',
    params: {{ name: 'concluir_tarefa', arguments: {{ id: Number(b.dataset.id) }} }} }}, '*');
}}));
</script></body></html>"""
