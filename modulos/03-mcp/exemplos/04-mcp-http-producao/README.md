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
