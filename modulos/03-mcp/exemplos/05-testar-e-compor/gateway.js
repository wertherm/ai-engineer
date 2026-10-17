// Front-end + back-end consumindo MCP (padrão BFF): o navegador fala só com este backend;
// o backend guarda os service tokens, é o client MCP e decide o que a UI pode chamar.
import express from 'express';
import { conectarTudo } from './composicao.js';

const PORT = Number(process.env.PORT ?? 30351);
const mcp = await conectarTudo({ portaCatalogo: 30352 });

// Governança: a UI só enxerga tools somente leitura (readOnlyHint). Escrita passa por outro fluxo.
const permitidas = mcp.tools.filter((t) => t.annotations?.readOnlyHint);
const nomesPermitidos = new Set(permitidas.map((t) => t.name));

const app = express();
app.use(express.json({ limit: '10kb' }));

app.get('/api/tools', (_req, res) => res.json(permitidas.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))));

app.post('/api/tools/:nome', async (req, res) => {
  if (!nomesPermitidos.has(req.params.nome)) return res.status(403).json({ erro: `Tool ${req.params.nome} não liberada para a UI` });
  const r = await mcp.chamar(req.params.nome, req.body ?? {});
  res.status(r.isError ? 422 : 200).json({ isError: !!r.isError, texto: r.content.map((c) => c.text).join('\n') });
});

// UI mínima: lista as tools e chama uma com argumentos JSON.
app.get('/', (_req, res) => res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Console MCP</title>
<body style="font-family:sans-serif;max-width:720px;margin:2rem auto">
<h1>Console MCP interno</h1>
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
</script>`));

const http = app.listen(PORT, '127.0.0.1', () => console.log(`Gateway em http://127.0.0.1:${PORT} (tools liberadas: ${[...nomesPermitidos].join(', ')})`));

const encerrar = async () => { http.close(); await mcp.fechar(); process.exit(0); };
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
