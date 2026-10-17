// "API REST externa" de cotações (fictícia, local). Em produção seria um serviço de terceiros.
import http from 'node:http';

const cotacoes = { USD: 5.42, EUR: 6.31 };

export function subirApi(porta = Number(process.env.PORTA_API ?? 30400)) {
  const server = http.createServer((req, res) => {
    const m = req.url.match(/^\/cotacao\/([A-Z]{3})$/);
    const valor = m && cotacoes[m[1]];
    res.writeHead(valor ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(valor ? { moeda: m[1], brl: valor, fonte: 'api-local' } : { erro: 'moeda não encontrada' }));
  });
  return new Promise((ok) => server.listen(porta, '127.0.0.1', () => ok(server)));
}
