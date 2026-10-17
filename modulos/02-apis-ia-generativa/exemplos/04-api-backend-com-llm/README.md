# Exemplo 04 · Integrar o LLM a uma API back-end (Fastify, /v1, token, testes)

**Conceito novo:** o LLM como **dependência** de uma API real: rota versionada `/v1`, autenticação por
Bearer token, validação de entrada antes de gastar tokens, falha do provedor mapeada para 502, e testes em
duas camadas — unitários com o LLM mockado (vitest) e integração contra o Ollama.

**Pré-requisito:** [exemplo 01](../01-prompt-chaining-e-templates/) e o [doc 03](../../docs/03-rag-backend-e-observabilidade.md).

| Arquivo | Papel |
|---|---|
| [`app.js`](app.js) | `buildApp({ llm, token })`: rotas, auth, validação, erros (sem abrir porta) |
| [`llm.js`](llm.js) | adaptador `{ resumir(texto) }` sobre o SDK `openai` |
| [`server.js`](server.js) | sobe de verdade na porta 30200 |
| [`app.test.js`](app.test.js) | 7 testes unitários, LLM = `vi.fn()` |
| [`integracao.test.js`](integracao.test.js) | 1 teste contra o LLM real (só com `INTEGRACAO=1`) |

## Como rodar

```bash
cd modulos/02-apis-ia-generativa
npx vitest run exemplos/04-api-backend-com-llm      # unitários (~2 s, sem rede)
npm run test:integracao                             # integração com o Ollama (~1 min)

# API de verdade (outro terminal para o curl)
API_TOKEN=segredo-local npm run ex04
curl -s localhost:30200/health
curl -s -X POST localhost:30200/v1/resumos -H 'authorization: Bearer segredo-local' \
  -H 'content-type: application/json' \
  -d '{"texto":"O time decidiu migrar o banco de dados para o PostgreSQL 18 em novembro, depois de testar a performance das consultas de relatório."}'
```

## Saída esperada

Testes unitários (saída real, `--reporter=verbose`):

```
 ✓ exemplos/04-api-backend-com-llm/app.test.js > POST /v1/resumos > 200: devolve o resumo do LLM 485ms
 ✓ exemplos/04-api-backend-com-llm/app.test.js > POST /v1/resumos > 401: sem token o LLM nem é chamado 84ms
 ✓ exemplos/04-api-backend-com-llm/app.test.js > POST /v1/resumos > 401: token errado 69ms
 ✓ exemplos/04-api-backend-com-llm/app.test.js > POST /v1/resumos > 400: texto curto demais (validação antes de gastar tokens) 58ms
 ✓ exemplos/04-api-backend-com-llm/app.test.js > POST /v1/resumos > 502: falha do provedor vira bad gateway 44ms
 ✓ exemplos/04-api-backend-com-llm/app.test.js > POST /v1/resumos > 404: versão que não existe 47ms
 ✓ exemplos/04-api-backend-com-llm/app.test.js > GET /health > responde sem token 56ms

 Test Files  1 passed | 1 skipped (2)
      Tests  7 passed | 1 skipped (8)
```

Teste de integração (saída real):

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  53.39s (tests 98%, import 2%)
```

API no ar, com `curl` (saída real; a última chamada levou 60 s em CPU):

```
{"status":"ok"}
{"erro":"token ausente ou inválido"}
{"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":"body/texto must NOT have fewer than 20 characters"}
{"resumo":"O time decidiu migrar seu banco de dados para o PostgreSQL 18 em novembro após testes de desempenho.","modelo":"qwen3.5:4b","tokens":83,"versao":"v1"}
```

E o log estruturado do Fastify (pino) para a chamada que usou o LLM:

```
{"level":30,...,"reqId":"req-5","tokens":83,"ms":60310,"msg":"resumo gerado"}
{"level":30,...,"reqId":"req-5","res":{"statusCode":200},"responseTime":60313.30476499999,"msg":"request completed"}
```

## Experimente

1. Crie um `/v2/resumos` que devolve `{ resumo, topicos: string[] }` (saída estruturada) ao lado do `/v1`,
   sem quebrar os testes do `/v1`.
2. Adicione um teste que garante que o `texto` acima de 4000 caracteres é recusado com 400 **sem** chamar o LLM.
3. Envolva `llm.resumir` com um timeout (`AbortSignal.timeout(30_000)` no SDK) e mapeie o estouro para 504.
