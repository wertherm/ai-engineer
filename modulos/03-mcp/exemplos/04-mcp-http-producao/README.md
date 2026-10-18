# Exemplo 04 · MCP em "produção": Streamable HTTP + service token + rate limit + auditoria

**Conceito novo:** servidor remoto via **Streamable HTTP stateless** protegido em camadas:
validação de `Host` (anti DNS rebinding, do SDK) → auditoria JSON Lines → `requireBearerAuth` do SDK
(service token com escopo) → rate limit por cliente → MCP. A identidade chega ao handler em `extra.authInfo`.

**Pré-requisito:** exemplo 01. Não usa Postgres nem Ollama (catálogo de produtos em memória).

- `seguranca.js`: tokens guardados como hash SHA-256, `verifyAccessToken` (com `expiresAt`, obrigatório),
  rate limit de janela fixa por `clientId` (429 + `Retry-After`) e middleware de auditoria.
- `server.js`: `createMcpExpressApp({ host: '127.0.0.1' })`, um `McpServer` + transport **por requisição**,
  `GET`/`DELETE /mcp` → 405 (sem sessão), `/health`.
- `teste.js`: sobe o servidor na porta 30341, roda 6 cenários com `assert` e derruba pelo PID.

Tokens de demonstração: `tok-copilot-demo`, `tok-ide-demo` (escopo `produtos:ler`) e `tok-sem-escopo`.

## Como rodar

```bash
cd modulos/03-mcp
npm run ex04                       # teste ponta a ponta
# servidor avulso (porta 30340) para mexer com curl:
npm run ex04:server
curl -s -X POST http://127.0.0.1:30340/mcp -H 'Authorization: Bearer tok-ide-demo' \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Saída esperada

```text
1) token válido -> tools: listar_produtos, consultar_estoque, quem_sou_eu
   quem_sou_eu -> {"cliente":"copilot-interno","escopos":["produtos:ler"]}
   consultar_estoque(MOE-010) -> {"sku":"MOE-010","preco":189,"estoque":7}
2) sem token -> 401 | Bearer error="invalid_token", error_description="Missing Authorization header", scope="produtos:ler"
3) token inválido -> 401 | Token inválido
4) token sem escopo -> 403 | Insufficient scope
5) rajada de 10 -> 200 200 200 200 200 200 200 200 429 429 | Retry-After: 60s
6) Host forjado -> 403

Auditoria (19 linhas, mostrando 4):
  {"ts":"2026-10-16T19:08:33.588Z","cliente":"copilot-interno","ip":"127.0.0.1","metodo_http":"POST","rpc":"initialize","tool":null,"status":200,"ms":84}
  {"ts":"2026-10-16T19:08:33.781Z","cliente":"copilot-interno","ip":"127.0.0.1","metodo_http":"POST","rpc":"tools/call","tool":"consultar_estoque","status":200,"ms":11}
  {"ts":"2026-10-16T19:08:33.795Z","cliente":null,"ip":"127.0.0.1","metodo_http":"POST","rpc":"tools/list","tool":null,"status":401,"ms":2}
  {"ts":"2026-10-16T19:08:33.937Z","cliente":"plugin-ide","ip":"127.0.0.1","metodo_http":"POST","rpc":"tools/list","tool":null,"status":429,"ms":0}

Todos os cenários passaram.
```

Proteções de borda que ficam **fora** deste código (WAF, TLS, limite por IP, CORS) estão no
[doc 04](../../docs/04-seguranca-e-governanca.md).

## Experimente

1. Remova o `expiresAt` do retorno de `verifyAccessToken` e rode `npm run ex04`: até o token válido passa a tomar 401 "Token has no expiration time".
2. Troque `enableJsonResponse: true` por `false` e faça o `curl` acima: a resposta vem como SSE (`event: message` / `data: ...`).
3. Mova o `app.use('/mcp', auditoria)` para depois do `requireBearerAuth` e veja quais tentativas deixam de ser auditadas (as 401).

## Versão Python

- [`python/seguranca.py`](python/seguranca.py): `VerificadorDeTokens` (protocolo `TokenVerifier` do SDK, tokens
  guardados como hash SHA-256, devolve `AccessToken` com `expires_at`), `RateLimitPorCliente` (janela fixa por
  `client_id`, 429 + `Retry-After`) e `Auditoria` (JSON Lines no stdout), ambos middlewares ASGI puros.
- [`python/server.py`](python/server.py): `MCPServer(token_verifier=..., auth=AuthSettings(required_scopes=["produtos:ler"]))`,
  `streamable_http_app(stateless_http=True, json_response=True, host="127.0.0.1")` (o `host` local liga a validação
  de Host/Origin do SDK), `/health` com `@mcp.custom_route`, servido pelo `uvicorn`. A identidade chega à tool por
  `get_access_token()`.
- [`python/teste.py`](python/teste.py): sobe o servidor na porta **30371**, roda 7 cenários com `assert` e derruba pelo PID.

Camadas (de fora para dentro): `Auditoria` → `AuthenticationMiddleware` (SDK) → `RateLimitPorCliente` →
`AuthContextMiddleware` (SDK) → `RequireAuthMiddleware` (SDK: 401/403) → transport (SDK: Host 421 / Origin 403) → MCP.
As nossas camadas entram com `app.user_middleware.insert(...)` no app que o SDK devolve.

### Como rodar

```bash
cd modulos/03-mcp
uv run python exemplos/04-mcp-http-producao/python/teste.py
# servidor avulso (porta 30370) para mexer com curl (mesmo curl do JS, trocando a porta):
uv run python exemplos/04-mcp-http-producao/python/server.py
```

### Saída esperada (Python)

```text
1) token válido -> tools: listar_produtos, consultar_estoque, quem_sou_eu
   quem_sou_eu -> {"cliente": "copilot-interno", "escopos": ["produtos:ler"]}
   consultar_estoque(MOE-010) -> {"sku": "MOE-010", "preco": 189.0, "estoque": 7}
2) sem token -> 401 | Bearer error="invalid_token", error_description="Authentication required"
3) token inválido -> 401 | token vencido -> 401 | Authentication required
4) token sem escopo -> 403 | Required scope: produtos:ler
5) rajada de 10 -> 200 200 200 200 200 200 200 200 429 429 | Retry-After: 60s
6) Host forjado -> 421 | Invalid Host header
7) Origin forjado -> 403 | Invalid Origin header

Auditoria (20 linhas, mostrando 4):
  {"ts": "2026-10-17T22:54:29.347Z", "cliente": "copilot-interno", "ip": "127.0.0.1", "metodo_http": "POST", "rpc": "server/discover", "tool": null, "status": 200, "ms": 3}
  {"ts": "2026-10-17T22:54:29.370Z", "cliente": "copilot-interno", "ip": "127.0.0.1", "metodo_http": "POST", "rpc": "tools/call", "tool": "consultar_estoque", "status": 200, "ms": 2}
  {"ts": "2026-10-17T22:54:29.377Z", "cliente": null, "ip": "127.0.0.1", "metodo_http": "POST", "rpc": "tools/list", "tool": null, "status": 401, "ms": 1}
  {"ts": "2026-10-17T22:54:29.420Z", "cliente": "copilot-interno", "ip": "127.0.0.1", "metodo_http": "POST", "rpc": "tools/list", "tool": null, "status": 403, "ms": 1}

Todos os cenários passaram.
```

Diferenças em relação ao JS (todas do SDK, não do exemplo):

- **Host forjado → 421** (Misdirected Request), não 403; e a checagem acontece **depois** da autenticação, dentro do
  transport (no JS o `createMcpExpressApp` barra antes). Por isso uma requisição com Host forjado e token válido
  conta no rate limit. Origin de outro site → 403 (cenário 7, extra).
- Sem token e token inválido dão a mesma resposta (`Authentication required`); `expires_at` é **opcional** (no JS
  é obrigatório), mas um token vencido é recusado com 401 (cenário 3).
- O client Python 2.x abre com `server/discover` (protocolo 2026-07-28) em vez de `initialize` — veja a 1ª linha da auditoria.
- Corpo limitado com `max_request_body_size=64 KiB` (padrão do SDK: 4 MiB, resposta 413).
