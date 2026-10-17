// Back-end "proxy de IA": o navegador NUNCA fala com o provedor do modelo. A chave/endpoint ficam
// só aqui (variáveis de ambiente), e o servidor aplica validação, limite de tamanho e rate limit.
import express from 'express';
import { join } from 'node:path';
import { criarCliente, conversar } from '../../comum/config.js';
import { criarPool, buscar, indexar } from './busca.js';

// Rate limit por IP em janela fixa (1 instância; com réplicas, use Redis ou o gateway/WAF).
function rateLimit(limite, janelaMs = 60_000) {
  const janelas = new Map();
  return (req, res, next) => {
    const agora = Date.now();
    let j = janelas.get(req.ip);
    if (!j || agora - j.inicio >= janelaMs) janelas.set(req.ip, (j = { inicio: agora, n: 0 }));
    if (++j.n > limite) {
      res.set('Retry-After', String(Math.ceil((j.inicio + janelaMs - agora) / 1000)));
      return res.status(429).json({ erro: 'Muitas requisições. Tente de novo em instantes.' });
    }
    next();
  };
}

// Valida a entrada ANTES de gastar token: texto obrigatório e curto.
function textoValido(campo, max = 300) {
  return (req, res, next) => {
    const v = req.body?.[campo];
    if (typeof v !== 'string' || !v.trim() || v.length > max) return res.status(400).json({ erro: `"${campo}" deve ter de 1 a ${max} caracteres` });
    next();
  };
}

export async function criarServidor({ limiteBusca = 30, limiteChat = 5 } = {}) {
  const cliente = criarCliente(); // lê OPENAI_BASE_URL / OPENAI_API_KEY do ambiente do SERVIDOR
  const pool = criarPool();
  await indexar(pool, cliente);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4kb' }));
  app.use(express.static(join(import.meta.dirname, 'public')));

  app.post('/api/busca', rateLimit(limiteBusca), textoValido('q'), async (req, res) => {
    const interesses = Array.isArray(req.body.interesses) ? req.body.interesses.slice(0, 5).map(String) : [];
    res.json(await buscar(pool, cliente, req.body.q, { interesses }));
  });

  app.post('/api/chat', rateLimit(limiteChat), textoValido('pergunta'), async (req, res) => {
    const trechos = await buscar(pool, cliente, req.body.pergunta, { k: 2 });
    const contexto = trechos.map((t) => `- ${t.pergunta} ${t.resposta}`).join('\n');
    // O prompt de sistema fica no servidor: o usuário não consegue trocá-lo pelo DevTools.
    const r = await conversar(cliente, [
      { role: 'system', content: 'Você é o suporte da loja. Responda em 1 ou 2 frases, em português, SÓ com base nos trechos. Se não souber, diga que vai encaminhar a um atendente.' },
      { role: 'user', content: `Trechos:\n${contexto}\n\nPergunta: ${req.body.pergunta}` },
    ], { maxTokens: 120 });
    res.json({ resposta: r.texto.trim(), fontes: trechos.map((t) => t.pergunta), segundos: r.segundos });
  });

  return { app, fechar: () => pool.end() };
}

// Executado direto: sobe na porta 30520.
if (import.meta.main) {
  const PORT = Number(process.env.PORT ?? 30520);
  const { app } = await criarServidor();
  app.listen(PORT, '127.0.0.1', () => console.log(`Suporte inteligente em http://127.0.0.1:${PORT}`));
}
