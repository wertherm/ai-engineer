"""Front-end + back-end consumindo MCP (padrão BFF) em Starlette: o navegador fala só com este backend;
o backend guarda os service tokens, é o client MCP e decide o que a UI pode chamar."""

import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse
from starlette.routing import Route

sys.path.insert(0, str(Path(__file__).parent))
from composicao import Composicao  # noqa: E402

PORT = int(os.environ.get("PORT", 30373))
LIMITE_CORPO = 10 * 1024
estado: dict = {}


@asynccontextmanager
async def lifespan(_app: Starlette):
    async with Composicao(porta_catalogo=30374) as mcp:
        # Governança: a UI só enxerga tools somente leitura (read_only_hint). Escrita passa por outro fluxo.
        estado["mcp"] = mcp
        estado["permitidas"] = [t for t in mcp.tools if t.annotations and t.annotations.read_only_hint]
        nomes = [t.name for t in estado["permitidas"]]
        print(f"Gateway em http://127.0.0.1:{PORT} (tools liberadas: {', '.join(nomes)})", flush=True)
        yield


async def listar(_: Request) -> JSONResponse:
    return JSONResponse([{"name": t.name, "description": t.description, "inputSchema": t.input_schema}
                         for t in estado["permitidas"]])


async def chamar(request: Request) -> JSONResponse:
    nome = request.path_params["nome"]
    if nome not in {t.name for t in estado["permitidas"]}:
        return JSONResponse({"erro": f"Tool {nome} não liberada para a UI"}, status_code=403)
    corpo = await request.body()
    if len(corpo) > LIMITE_CORPO:
        return JSONResponse({"erro": "corpo grande demais"}, status_code=413)
    r = await estado["mcp"].chamar(nome, json.loads(corpo or b"{}"))
    # structured_content compacto quando existe (o content do MCPServer Python vem indentado).
    if r.structured_content is not None:
        texto = json.dumps(r.structured_content, ensure_ascii=False)
    else:
        texto = "\n".join(getattr(c, "text", "") for c in r.content)
    return JSONResponse({"isError": bool(r.is_error), "texto": texto}, status_code=422 if r.is_error else 200)


PAGINA = """<!doctype html><meta charset="utf-8"><title>Console MCP</title>
<body style="font-family:sans-serif;max-width:720px;margin:2rem auto">
<h1>Console MCP interno (Python)</h1>
<select id="tool"></select>
<textarea id="args" rows="3" style="width:100%">{"termo":"padaria"}</textarea>
<button id="go">Chamar</button><pre id="out"></pre>
<script>
  const sel = document.getElementById('tool');
  fetch('/api/tools').then(r => r.json()).then(ts => ts.forEach(t => sel.add(new Option(t.name + ' - ' + t.description, t.name))));
  document.getElementById('go').onclick = async () => {
    const r = await fetch('/api/tools/' + sel.value, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: document.getElementById('args').value });
    document.getElementById('out').textContent = JSON.stringify(await r.json(), null, 2);
  };
</script>"""

app = Starlette(
    routes=[
        Route("/", lambda _: HTMLResponse(PAGINA)),
        Route("/api/tools", listar),
        Route("/api/tools/{nome}", chamar, methods=["POST"]),
    ],
    lifespan=lifespan,
)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
