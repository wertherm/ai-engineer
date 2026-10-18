# Entrega 2 · API documentada (OpenAPI) e MCP habilitado

**Conceito novo**: transformar a lógica validada no CLI em **produto integrável** — uma API REST versionada
com contrato **OpenAPI 3.1** e um **servidor MCP** no mesmo processo, com a mesma autenticação
multi-tenant. A partir daqui, qualquer front, script ou agente usa o serviço sem conhecer o banco.

O que esta entrega introduz em [`app/src/`](../../app/src/): `tenants.js` (API key → tenant, só hash),
`api.js` (Fastify + `@fastify/swagger` + Swagger UI, auth, rate limit por tenant, 502 do provedor,
`/mcp` Streamable HTTP stateless com validação de Origin), `mcp.js` (3 tools) e `server.js`.
Testes de contrato com dublês: [`app/test/api.test.js`](../../app/test/api.test.js). Teoria nos docs
[02](../../docs/02-rag-agentes-e-mcp.md#ponte-ia-ui-o-serviço-como-servidor-mcp) e
[03](../../docs/03-front-ci-cd-e-implantacao.md#validação-do-mcp-com-ferramentas).
O front com MCP habilitado (a outra metade da Entrega 2) está na [entrega 3](../03-entrega-3-front-e-implantacao/).

**Pré-requisito**: [entrega 1](../01-entrega-1-rag-cli/) (`npm run seed` feito) e `jq`.

## Como rodar

```bash
cd modulos/11-capstone-micro-saas
npm test                 # contrato REST + MCP com dublês (sem banco, sem LLM)
npm run e2               # demo.sh: sobe a API na 31121, exercita o contrato com curl, exporta openapi.json
npm run e2:inspector     # inspector.sh: MCP Inspector CLI 2.11.0 contra a API na 31120
npm run e2:server        # servidor avulso em http://127.0.0.1:31100 (Swagger UI em /docs); Ctrl+C para parar
```

## Saída esperada

`npm test`:

```
 Test Files  3 passed | 1 skipped (4)
      Tests  21 passed | 4 skipped (25)
```

`npm run e2` (o contrato exportado fica em [`openapi.json`](openapi.json)):

```
== GET /openapi.json (contrato) -> exemplos/02-entrega-2-api-e-mcp/openapi.json
  GET /health
  GET /v1/me
  GET /v1/documentos
  POST /v1/documentos
  DELETE /v1/documentos/{fonte}
  POST /v1/busca
  POST /v1/perguntas
  (Swagger UI interativa em http://127.0.0.1:31121/docs enquanto o servidor estiver no ar)
== GET /v1/me com cada API key
{"id":"acme","nome":"Acme Software","plano":"pro"}
{"id":"padaria","nome":"Padaria Pão Quente","plano":"free"}
== erros do contrato: 401 sem chave · 400 validação · 404 documento inexistente
  401
  400
  404
== POST /v1/documentos (padaria envia uma política nova) e DELETE em seguida
{"fonte":"vale-transporte.md","chunks":2}
{"fonte":"vale-transporte.md","sim":0.828}
{"fonte":"vale-transporte.md","removidos":2}
== POST /v1/perguntas (RAG + LLM; lento em CPU)
{"resposta":"O valor do auxílio home office é de R$ 150,00 por mês [1]. Este benefício é pago junto com o salário para custear despesas como internet e energia.","citacoes":["home-office.md"],"verificado":true,"cache":false,"tokens":384}

real	6m14.237s
```

(Rodando de novo no mesmo dia, a última pergunta sai do cache semântico em segundos.)

`npm run e2:inspector`:

```
== tools/list (tenant acme)
[{"name":"listar_documentos","readOnly":true},{"name":"buscar_politicas","readOnly":true},{"name":"perguntar","readOnly":true}]
== tools/call buscar_politicas (acme): 'auxílio home office'
{"fonte":"home-office.md","similaridade":0.692,"trecho":"Política de home office (Acme Software): A empresa paga um auxílio hom"}
== mesma busca com a chave da padaria: isolamento por tenant
{"fonte":"ferias.md","similaridade":0.276}
== tools/call listar_documentos (padaria)
["ferias.md","turnos-e-faltas.md","uniforme-e-higiene.md"]
== argumento inválido (k=99) -> isError e exit code != 0 (o CI falha se uma tool quebrar)
{"isError":true,"msg":"MCP error -32602: Input validation error: Invalid arguments for tool buscar_poli"}
exit code: 5
== sem API key -> 401 (--stored-auth-only evita o Inspector tentar OAuth interativo)
{"error":{"code":"auth_required","message":"Error POSTing to endpoint: {\"erro\":\"API key ausente ou inválida\"}"}}
exit code: 3
```

## Experimente

1. Abra o Swagger UI (`npm run e2:server` e http://127.0.0.1:31100/docs), clique em **Authorize**, cole `sk-acme-demo` e chame `POST /v1/busca` pela página.
2. Gere um cliente a partir do contrato: `npx @openapitools/openapi-generator-cli generate -i exemplos/02-entrega-2-api-e-mcp/openapi.json -g typescript-fetch -o /tmp/cliente` (precisa de Java) — ou só leia o `openapi.json` e veja os schemas de erro.
3. Conecte o servidor num cliente MCP de verdade (servidor no ar com `npm run e2:server`). No Claude Code: `claude mcp add --transport http politicas http://127.0.0.1:31100/mcp --header "Authorization: Bearer sk-acme-demo"` (não executado localmente: exige login no cliente).

## Versão Python

A mesma API em **FastAPI** ([`app_py/api.py`](../../app_py/api.py)) e o mesmo servidor MCP com o SDK oficial
**`mcp` 2.3.0** ([`app_py/servidor_mcp.py`](../../app_py/servidor_mcp.py)), no mesmo processo e com a mesma
autenticação. Contrato idêntico: rotas `/v1/...`, códigos 401/400/404/429/502, corpo `{"erro": ...}`,
cabeçalhos `WWW-Authenticate`, `RateLimit-Remaining` e `Retry-After`, `/mcp` stateless com as 3 tools
(`listar_documentos`, `buscar_politicas`, `perguntar`), `structuredContent: {itens}` e Origin na allowlist (403).
O OpenAPI 3.1 e o Swagger UI (`/docs`) são gerados pelo FastAPI a partir dos modelos Pydantic; o contrato
exportado fica em [`python/openapi.json`](python/openapi.json).

O que precisou de cuidado para o contrato ficar igual ao do Fastify:

- **422 → 400**: o FastAPI responde 422 em corpo inválido; um `exception_handler(RequestValidationError)` devolve 400 no formato do Fastify (`statusCode`, `error`, `message`).
- **Autenticação antes do corpo**: API key, rate limit e Origin rodam num middleware ASGI (o `onRequest` do Fastify), antes de o FastAPI ler o JSON. Sem chave é 401 até com JSON quebrado, e o serviço nem é chamado.
- **Um servidor MCP por requisição**, amarrado ao tenant (como no JS): `MCPServer(...)` + `streamable_http_app(stateless_http=True, json_response=True)` + `session_manager.run()` só durante aquele POST. As instruções levam o nome da empresa.
- **Campos internos filtrados**: `response_model=Resposta` + `response_model_exclude_none=True` faz o papel do schema de resposta do Fastify (`passos` e `motivoBloqueio` não saem na API).

### Como rodar

```bash
cd modulos/11-capstone-micro-saas
uv sync
uv run pytest app_py/tests                               # contrato REST + MCP com dublês (sem banco, sem LLM)
bash exemplos/02-entrega-2-api-e-mcp/python/demo.sh       # sobe a API Python na 31151, mesmo roteiro curl do demo.sh
bash exemplos/02-entrega-2-api-e-mcp/python/inspector.sh  # MCP Inspector CLI 2.11.0 contra a API Python na 31152
uv run python -m app_py.server                            # servidor avulso em http://127.0.0.1:31150 (Swagger em /docs)
```

### Saída esperada (Python)

`uv run pytest app_py/tests`:

```
..........ssss.........                                                  [100%]
19 passed, 4 skipped in 1.19s
```

`python/demo.sh` (a última pergunta já estava no cache semântico do tenant, gerada antes pelo teste e2e da entrega 3):

```
== GET /openapi.json (contrato) -> exemplos/02-entrega-2-api-e-mcp/python/openapi.json
  GET /health
  GET /v1/me
  GET /v1/documentos
  POST /v1/documentos
  DELETE /v1/documentos/{fonte}
  POST /v1/busca
  POST /v1/perguntas
  (Swagger UI interativa em http://127.0.0.1:31151/docs enquanto o servidor estiver no ar)
== GET /v1/me com cada API key
{"id":"acme","nome":"Acme Software","plano":"pro"}
{"id":"padaria","nome":"Padaria Pão Quente","plano":"free"}
== erros do contrato: 401 sem chave · 400 validação · 404 documento inexistente
  401
  400
  404
== POST /v1/documentos (padaria envia uma política nova) e DELETE em seguida
{"fonte":"vale-transporte.md","chunks":2}
{"fonte":"vale-transporte.md","sim":0.828}
{"fonte":"vale-transporte.md","removidos":2}
== POST /v1/perguntas (RAG + LLM; lento em CPU)
{"resposta":"O valor do auxílio home office é de R$ 150,00 por mês [1]. Este benefício é pago junto com o salário para custear despesas como internet e energia.","citacoes":["home-office.md"],"verificado":true,"cache":true,"tokens":384}

real	0m0.101s
```

`python/inspector.sh` (o mesmo Inspector, só a porta muda; a única diferença é o texto do erro de validação, que vem do Pydantic):

```
== tools/list (tenant acme)
[{"name":"listar_documentos","readOnly":true},{"name":"buscar_politicas","readOnly":true},{"name":"perguntar","readOnly":true}]
== tools/call buscar_politicas (acme): 'auxílio home office'
{"fonte":"home-office.md","similaridade":0.692,"trecho":"Política de home office (Acme Software): A empresa paga um auxílio hom"}
== mesma busca com a chave da padaria: isolamento por tenant
{"fonte":"ferias.md","similaridade":0.276}
== tools/call listar_documentos (padaria)
["ferias.md","turnos-e-faltas.md","uniforme-e-higiene.md"]
== argumento inválido (k=99) -> isError e exit code != 0 (o CI falha se uma tool quebrar)
{"isError":true,"msg":"Error executing tool buscar_politicas: 1 validation error for buscar_politicasAr"}
exit code: 5
== sem API key -> 401 (--stored-auth-only evita o Inspector tentar OAuth interativo)
{"error":{"code":"auth_required","message":"Error POSTing to endpoint: {\"erro\":\"API key ausente ou inválida\"}"}}
exit code: 3
```
