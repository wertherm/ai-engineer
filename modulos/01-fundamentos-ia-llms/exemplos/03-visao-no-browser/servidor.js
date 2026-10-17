// Servidor estático mínimo (sem dependências) para a página do exemplo 03.
// Precisa ser HTTP (não file://): o browser bloqueia fetch de .wasm/.tflite em file://.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raizModulo = join(aqui, '..', '..'); // para servir /node_modules/@mediapipe/...
const tipos = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.wasm': 'application/wasm', '.tflite': 'application/octet-stream', '.webm': 'video/webm', '.jpg': 'image/jpeg',
};

export function iniciarServidor(porta = Number(process.env.PORTA ?? 30100)) {
  const server = createServer(async (req, res) => {
    const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (caminho.includes('..')) return res.writeHead(400).end();
    const base = caminho.startsWith('/node_modules/') ? raizModulo : aqui;
    const arquivo = join(base, caminho === '/' ? 'index.html' : caminho);
    try {
      const corpo = await readFile(arquivo);
      res.writeHead(200, { 'content-type': tipos[extname(arquivo)] ?? 'application/octet-stream' }).end(corpo);
    } catch {
      res.writeHead(404).end('não encontrado');
    }
  });
  return new Promise((ok) => server.listen(porta, '127.0.0.1', () => ok(server)));
}

// Executado direto: `node exemplos/03-visao-no-browser/servidor.js` e abra http://127.0.0.1:30100
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await iniciarServidor();
  console.log(`abra http://127.0.0.1:${s.address().port} (Ctrl+C para parar)`);
}
