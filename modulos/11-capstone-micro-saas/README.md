# Módulo 11 · Projeto Integrador – Capstone Project (Micro-SaaS)

O projeto integrador da pós: **Políticas com Fonte**, um Micro-SaaS multi-tenant que responde dúvidas
sobre as políticas internas de pequenas empresas **citando o documento de origem** — da ideação à
implantação, juntando RAG, agentes, MCP, API, UI Angular, CI/CD e a defesa técnica.

Estudado em 2026-10-17 com Node 24, `@google/adk` 2.3.0, Angular 22.2.3, `@modelcontextprotocol/sdk`
1.32.1 e Fastify 5.12.7, sobre a infra local (Ollama `qwen3.5:4b` + `qwen3-embedding:0.6b`, Postgres 18 + pgvector).

Reaproveita (copiando e adaptando, sem importar de outras pastas) os módulos
[01](../01-fundamentos-ia-llms/) (RAG com pgvector), [02](../02-apis-ia-generativa/) (API Fastify,
testes, undici), [03](../03-mcp/) (MCP HTTP com token e Inspector), [04](../04-agentes-autonomos/)
(agent loop), [08](../08-arquitetura-de-sistemas-com-ia/) (busca híbrida RRF, cache semântico) e
[10](../10-seguranca-e-governanca/) (prompt injection, PII). O mapa do que veio de onde está no
[doc 01](docs/01-ideacao-e-arquitetura.md#arquitetura).

**Versão Python do back-end** em [`app_py/`](app_py/) (2026-10-18, Python 3.14 + uv): FastAPI 0.141.1 (OpenAPI
automático), SDK `mcp` 2.3.0, psycopg 3 + pgvector, `google-adk` 2.12.0 com LiteLLM. MESMO contrato da API JS
(rotas `/v1`, status, JSON, `/mcp` com as mesmas tools), provado rodando o e2e da UI Angular, sem mudar o
Angular, contra a API Python. Cada exemplo/exercício tem a seção "Versão Python" no seu README.

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| **U1** Problema e escopo do Micro-SaaS | [doc 01 · problema e escopo](docs/01-ideacao-e-arquitetura.md#o-problema) |
| U1 Viabilidade (público-alvo, proposta de valor) | [doc 01 · Lean Canvas](docs/01-ideacao-e-arquitetura.md#viabilidade-lean-canvas-resumido) |
| U1 Arquitetura: front-end, back-end e IA (RAG, agentes, orquestração) | [doc 01 · diagrama](docs/01-ideacao-e-arquitetura.md#arquitetura) |
| U1 Planejamento (milestones, backlog inicial, stack) | [doc 01 · planejamento](docs/01-ideacao-e-arquitetura.md#planejamento-milestones-e-backlog) |
| **U2** Núcleo de RAG | [doc 02](docs/02-rag-agentes-e-mcp.md#núcleo-de-rag) · [`app/src/rag.js`](app/src/rag.js) · [entrega 1](exemplos/01-entrega-1-rag-cli/) |
| U2 Seleção e configuração do Vector Database | [doc 02 · banco vetorial](docs/02-rag-agentes-e-mcp.md#seleção-e-configuração-do-banco-vetorial) · [`app/src/db.js`](app/src/db.js) |
| U2 Agente principal que usa o RAG para queries complexas | [doc 02 · agente](docs/02-rag-agentes-e-mcp.md#agente-principal) · [`app/src/agente.js`](app/src/agente.js) · [entrega 1 (`--agente`)](exemplos/01-entrega-1-rag-cli/) |
| U2 **Entrega 1**: protótipo funcional do RAG com CLI | [exemplos/01-entrega-1-rag-cli](exemplos/01-entrega-1-rag-cli/) |
| **U3** APIs do back-end | [entrega 2](exemplos/02-entrega-2-api-e-mcp/) · [`app/src/api.js`](app/src/api.js) |
| U3 Ponte IA-UI: MCP na aplicação | [doc 02 · MCP](docs/02-rag-agentes-e-mcp.md#ponte-ia-ui-o-serviço-como-servidor-mcp) · [`app/src/mcp.js`](app/src/mcp.js) · [entrega 2](exemplos/02-entrega-2-api-e-mcp/) |
| U3 Orquestração de múltiplos agentes/LLMs com o Google ADK | [doc 02 · ADK](docs/02-rag-agentes-e-mcp.md#orquestração-multiagente-com-o-google-adk) · [exemplo 04](exemplos/04-orquestracao-adk/) (ADK no LLM local via adaptador `BaseLlm`; com Gemini: não executado localmente, exige chave Google) |
| U3 **Entrega 2**: API documentada (OpenAPI) e funcional + front com MCP habilitado | [entrega 2](exemplos/02-entrega-2-api-e-mcp/) (OpenAPI, Inspector) + [UI Angular cliente MCP](exemplos/03-entrega-3-front-e-implantacao/) |
| **U4** UI em Angular estruturada com o MCP | [doc 03 · Angular](docs/03-front-ci-cd-e-implantacao.md#a-ui-em-angular) · [`app/web/`](app/web/) |
| U4 Integração front ↔ API | [doc 03](docs/03-front-ci-cd-e-implantacao.md#a-ui-em-angular) · [entrega 3 (`ui.e2e.js`)](exemplos/03-entrega-3-front-e-implantacao/) |
| U4 Validação do MCP com ferramentas (Inspector) | [doc 03 · validação](docs/03-front-ci-cd-e-implantacao.md#validação-do-mcp-com-ferramentas) · [`inspector.sh`](exemplos/02-entrega-2-api-e-mcp/inspector.sh) |
| U4 Pipeline de CI/CD | [doc 03 · CI/CD](docs/03-front-ci-cd-e-implantacao.md#pipeline-de-cicd) · [`ci.yml`](exemplos/03-entrega-3-front-e-implantacao/ci.yml) (CI executado localmente; deploy: não executado localmente) · [exercício 02](exercicios/02-avaliacao-no-ci/) |
| U4 **Entrega 3**: solução implantada + agente interagindo via MCP | [entrega 3](exemplos/03-entrega-3-front-e-implantacao/) (compose + `agente-mcp.js`) |
| **U5** Storytelling, demo ao vivo, resultados | [doc 04](docs/04-apresentacao-e-defesa.md#storytelling-3-minutos) |
| U5 Defesa técnica das decisões | [doc 04 · ADRs](docs/04-apresentacao-e-defesa.md#adrs-architecture-decision-records) |
| U5 README, diagrama de arquitetura e instruções de uso | este README · [doc 01 · diagrama](docs/01-ideacao-e-arquitetura.md#arquitetura) · [doc 03 · implantação](docs/03-front-ci-cd-e-implantacao.md#implantação-local-com-docker-compose) |
| U5 Critérios de avaliação | [doc 04 · rubrica](docs/04-apresentacao-e-defesa.md#critérios-de-avaliação-rubrica) |
| Extensão: multi-tenant com cota por cliente | [exercício 01](exercicios/01-cota-por-cliente/) |
| Extensão: avaliação automática (hit@k, citações) no CI | [exercício 02](exercicios/02-avaliacao-no-ci/) |

## Estrutura

```
app/
  src/        config, llm, db, rag, servico (fachada), agente, pii, tenants, api (REST+MCP), mcp, server, seed
  test/       vitest: rag (unidade), api (contrato REST e MCP com dublês), integracao (banco real)
  dados/      corpus de demonstração: acme/ e padaria/
  web/        UI Angular 22 (cliente REST + cliente MCP) + Dockerfile/nginx
  Dockerfile  imagem da API
app_py/       versão Python do back-end: config, llm, db, rag, servico, agente, pii, tenants, api (FastAPI+MCP),
              servidor_mcp, server, seed, tests/ (pytest) e Dockerfile
docs/         01 ideação e arquitetura · 02 RAG, agentes, MCP e ADK · 03 front, CI/CD e implantação · 04 apresentação e defesa
exemplos/     as entregas incrementais 01, 02, 03 + 04 orquestração com ADK
exercicios/   01 cota por cliente · 02 avaliação no CI
```

## Pré-requisitos

- Infra do repositório no ar (a partir da raiz): `bash infra/subir-ia.sh` (Ollama na 11434, Postgres na 5433).
  Os dados ficam no schema `m11`.
- Node 24 e `npm install` nesta pasta. Docker (build do Angular, imagens e compose), `jq`, Google Chrome
  (teste e2e).
- Versão Python: [`uv`](https://docs.astral.sh/uv/) e `uv sync` nesta pasta (projeto próprio: [`pyproject.toml`](pyproject.toml)
  + `uv.lock`, Python 3.14). Os dados Python ficam nas tabelas `m11.*_py` (as do JS não são tocadas).
- Variáveis opcionais (defaults locais, ver `infra/.env.example`): `OPENAI_BASE_URL`, `OPENAI_API_KEY`,
  `MODELO_CHAT`, `MODELO_EMBED`, `DATABASE_URL`.
- O LLM em CPU é lento e compartilhado: uma resposta nova leva de segundos a vários minutos. Cache semântico
  e "não encontrei" respondem em segundos.

## Como rodar

```bash
cd modulos/11-capstone-micro-saas
npm install
npm run seed                      # schema m11 + 2 tenants + indexação (~40 s)

# Entrega 1 · RAG em CLI
npm run e1 -- buscar acme "limite de alimentação em viagem"
npm run e1 -- perguntar acme "Posso dividir minhas férias em partes?"
npm run e1 -- perguntar acme "Vou viajar 3 dias: quanto gasto com alimentação no total?" --agente

# Entrega 2 · API + OpenAPI + MCP
npm test                          # unidade + contrato REST/MCP + adaptador ADK (sem LLM, segundos)
npm run test:integracao           # isolamento multi-tenant no banco real
npm run e2                        # curl no contrato + exporta openapi.json
npm run e2:inspector              # MCP Inspector CLI

# Entrega 3 · front Angular + implantação + agente via MCP
npm run e3:subir                  # docker compose (API :31180, UI :31181)
npm run e3:ui                     # Playwright headless no Chrome
npm run e3:agente                 # agente externo via MCP
npm run e3:ci                     # passos do CI localmente
npm run e3:descer                 # derruba só este compose

# Orquestração com ADK
npm run e4

# Exercícios
npm run exe01                     # cota diária por cliente
npm run exe02                     # avaliação hit@k / MRR / citações (portão de CI)
npm run lint
```

Portas: 31100 (API avulsa), 31101–31121 (scripts e testes: 31110 vitest, 31120 Inspector, 31121 demo),
31180 (API no compose), 31181 (UI no compose).

### Versão Python

```bash
cd modulos/11-capstone-micro-saas
uv sync
uv run python -m app_py.seed                      # tabelas m11.*_py + 2 tenants + indexação

# Entrega 1 · RAG em CLI
uv run python exemplos/01-entrega-1-rag-cli/python/cli.py buscar acme "limite de alimentação em viagem"
uv run python exemplos/01-entrega-1-rag-cli/python/cli.py perguntar acme "Posso dividir minhas férias em partes?"
uv run python exemplos/01-entrega-1-rag-cli/python/cli.py perguntar acme "Vou viajar 3 dias: quanto gasto com alimentação no total?" --agente

# Entrega 2 · API FastAPI + OpenAPI + MCP
uv run pytest                                     # unidade + contrato REST/MCP + cota (sem LLM, ~1 s)
INTEGRACAO=1 uv run pytest                        # + integração no banco real e concorrência da cota
uv run ruff check .                               # lint
bash exemplos/02-entrega-2-api-e-mcp/python/demo.sh
bash exemplos/02-entrega-2-api-e-mcp/python/inspector.sh
uv run python -m app_py.server                    # API avulsa em http://127.0.0.1:31150 (Swagger em /docs)

# Entrega 3 · mesma UI Angular na frente da API Python
docker compose -f exemplos/03-entrega-3-front-e-implantacao/python/compose.yaml up -d --build --wait   # API :31190, UI :31191
URL_UI=http://localhost:31191 npm run e3:ui       # o e2e JS inalterado contra a API Python
uv run python exemplos/03-entrega-3-front-e-implantacao/python/ui_e2e.py
uv run python exemplos/03-entrega-3-front-e-implantacao/python/agente_mcp.py
bash exemplos/03-entrega-3-front-e-implantacao/python/ci-local.sh
docker compose -f exemplos/03-entrega-3-front-e-implantacao/python/compose.yaml down

# Orquestração com ADK Python (LiteLLM -> Ollama) e exercícios
uv run python exemplos/04-orquestracao-adk/python/main.py
INTEGRACAO=1 uv run pytest exercicios/01-cota-por-cliente -v
uv run python exercicios/02-avaliacao-no-ci/solucao/python/avaliar.py
```

Portas da versão Python: 31150 (API avulsa), 31151 (demo), 31152 (Inspector), 31160 (pytest do MCP),
31190 (API no compose), 31191 (UI no compose).

## Status de verificação

| Item | Status |
|---|---|
| Entrega 1 · CLI: indexar, buscar, perguntar, PII, cache, "não encontrei", modo agente | ✅ executado |
| Testes vitest (21 unidade/contrato + 4 integração) | ✅ executado |
| Entrega 2 · API REST + OpenAPI 3.1 + Swagger UI + `openapi.json` exportado | ✅ executado |
| Entrega 2 · MCP validado com MCP Inspector CLI 2.11.0 | ✅ executado |
| UI Angular 22.2.3 (build em container `node:24.22.0-alpine`) | ✅ executado |
| Entrega 3 · docker compose (API + web) sobre a infra compartilhada | ✅ executado |
| Entrega 3 · e2e com Playwright (`playwright-core` + Chrome headless) | ✅ executado |
| Entrega 3 · agente LLM externo usando a aplicação via MCP | ✅ executado |
| CI local (`npm ci`, lint, testes, build do front, `docker build` das imagens) | ✅ executado |
| CI no GitHub Actions e job de deploy (GHCR + SSH) | ⚠️ não executado localmente: precisa de repositório, runner, registry e servidor reais |
| Exemplo 04 · Workflow do ADK (2 agentes LLM + nó de código) no Ollama local | ✅ executado |
| ADK com Gemini/Vertex | ⚠️ não executado localmente: exige chave/conta Google |
| Exercício 01 · cota por cliente (inclui teste de concorrência no Postgres) | ✅ executado |
| Exercício 02 · avaliação hit@k/MRR/citações (+ reprovação provocada) | ✅ executado |
| Job nightly de avaliação no GitHub Actions | ⚠️ não executado localmente: precisa de runner do GitHub |
| **Python** · Entrega 1 · CLI (indexar, buscar, perguntar, PII, cache, "não encontrei", `--agente`) | ✅ executado |
| **Python** · pytest (9 RAG + 10 contrato REST/MCP + 4 integração + 5 cota) e `ruff check` | ✅ executado |
| **Python** · Entrega 2 · FastAPI + OpenAPI 3.1 + Swagger UI + `python/openapi.json`; `demo.sh` e MCP Inspector CLI | ✅ executado |
| **Python** · Entrega 3 · compose alternativo (imagem `app_py/Dockerfile` + UI Angular inalterada) | ✅ executado |
| **Python** · Entrega 3 · e2e da UI Angular (o `ui.e2e.js` JS e o `ui_e2e.py` Playwright Python) contra a API Python | ✅ executado |
| **Python** · Entrega 3 · agente externo via MCP; CI local (`python/ci-local.sh`) | ✅ executado |
| **Python** · job `api-python` no GitHub Actions | ⚠️ não executado localmente: precisa de runner do GitHub |
| **Python** · Exemplo 04 · Workflow do ADK Python (`LiteLlm` `ollama_chat/`) no Ollama local | ✅ executado |
| **Python** · Exercícios 01 (cota + concorrência) e 02 (portão de qualidade + reprovação provocada) | ✅ executado |
| **Python** · UI Angular | não se aplica: é front-end (roda no navegador); a compatibilidade foi provada pelo e2e |

## Fontes

- Google ADK: https://google.github.io/adk-docs/ · https://github.com/google/adk-js · https://www.npmjs.com/package/@google/adk
- Versão Python: https://fastapi.tiangolo.com/ · https://github.com/modelcontextprotocol/python-sdk · https://www.psycopg.org/psycopg3/docs/ · https://github.com/pgvector/pgvector-python · https://google.github.io/adk-docs/agents/models/litellm/ · https://google.github.io/adk-docs/agents/models/ollama/ · https://docs.litellm.ai/docs/providers/ollama · https://docs.astral.sh/uv/ · https://playwright.dev/python/
- Angular: https://angular.dev/reference/versions · https://angular.dev/guide/signals
- MCP: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports · https://github.com/modelcontextprotocol/typescript-sdk · https://github.com/modelcontextprotocol/inspector
- Fastify + OpenAPI: https://fastify.dev/ · https://github.com/fastify/fastify-swagger
- pgvector: https://github.com/pgvector/pgvector · full-text: https://www.postgresql.org/docs/current/textsearch.html
- GitHub Actions: https://docs.github.com/en/actions · Docker Compose: https://docs.docker.com/compose/
- Playwright: https://playwright.dev/docs/api/class-browsertype
- ADRs: https://adr.github.io/ · Lean Canvas: https://leanstack.com/lean-canvas
