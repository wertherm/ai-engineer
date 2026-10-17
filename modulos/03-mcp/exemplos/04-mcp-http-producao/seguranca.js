// Peças de segurança/governança do servidor HTTP: service tokens, rate limit e auditoria.
import { createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Service tokens: guardamos SÓ o hash (vazou o arquivo/banco, não vazou o token).
// Em produção viriam de um secret manager/banco; aqui são tokens de demonstração.
const agora = () => Math.floor(Date.now() / 1000);
const TOKENS = new Map([
  [sha256('tok-copilot-demo'), { clientId: 'copilot-interno', scopes: ['produtos:ler'], expiraEm: agora() + 3600 }],
  [sha256('tok-ide-demo'), { clientId: 'plugin-ide', scopes: ['produtos:ler'], expiraEm: agora() + 3600 }],
  [sha256('tok-sem-escopo'), { clientId: 'curioso', scopes: [], expiraEm: agora() + 3600 }],
]);

// Formato exigido pelo requireBearerAuth do SDK (interface OAuthTokenVerifier).
export const verificadorDeTokens = {
  async verifyAccessToken(token) {
    const registro = TOKENS.get(sha256(token));
    if (!registro) {
      // InvalidTokenError -> 401 com WWW-Authenticate. Importado sob demanda para manter o arquivo legível.
      const { InvalidTokenError } = await import('@modelcontextprotocol/sdk/server/auth/errors.js');
      throw new InvalidTokenError('Token inválido');
    }
    // expiresAt é OBRIGATÓRIO: sem ele o SDK responde 401 "Token has no expiration time".
    return { token, clientId: registro.clientId, scopes: registro.scopes, expiresAt: registro.expiraEm };
  },
};

// Rate limit por cliente (janela fixa). Simples e suficiente para 1 instância;
// com várias réplicas o contador precisa ir para um store compartilhado (Redis) ou para o gateway/WAF.
export function rateLimitPorCliente({ limite, janelaMs }) {
  const janelas = new Map(); // clientId -> { inicio, contagem }
  return (req, res, next) => {
    const chave = req.auth?.clientId ?? req.ip;
    const t = Date.now();
    let j = janelas.get(chave);
    if (!j || t - j.inicio >= janelaMs) janelas.set(chave, (j = { inicio: t, contagem: 0 }));
    j.contagem++;
    res.set('RateLimit-Limit', String(limite));
    res.set('RateLimit-Remaining', String(Math.max(0, limite - j.contagem)));
    if (j.contagem > limite) {
      const retry = Math.ceil((j.inicio + janelaMs - t) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: `Limite de ${limite} req por ${janelaMs / 1000}s excedido` }, id: null });
    }
    next();
  };
}

// Log de auditoria em JSON Lines: quem chamou o quê, quando, com qual resultado.
// Nunca logar o token nem argumentos sensíveis por inteiro.
export function auditoria(req, res, next) {
  const inicio = Date.now();
  res.on('finish', () => {
    const corpo = req.body ?? {};
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      cliente: req.auth?.clientId ?? null,
      ip: req.ip,
      metodo_http: req.method,
      rpc: corpo.method ?? null,
      tool: corpo.params?.name ?? null,
      status: res.statusCode,
      ms: Date.now() - inicio,
    }));
  });
  next();
}
