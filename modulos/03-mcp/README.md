# Módulo 03 · MCP – Model Context Protocol

Como o MCP padroniza a conexão entre LLMs e sistemas (APIs, bancos, serviços internos) e como criar, consumir,
testar, compor e proteger servidores MCP em JavaScript **e em Python**, do stdio local ao Streamable HTTP com auth e rate limit.

SDK estudado: `@modelcontextprotocol/sdk` **1.32.1** (protocolo `2025-11-25`), MCP Inspector **2.11.0**, estudado em 2026-10-16.
Versão Python (2026-10-17): SDK oficial `mcp` **2.3.0** (o `FastMCP` virou `MCPServer`; protocolo `2026-07-28`
entre peers Python, com queda automática para `2025-11-25` ao falar com o SDK JS), em `python/` dentro de cada
exemplo e de cada `solucao/`, com código comum em [`comum_py/`](comum_py/).

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| Visão geral: o que é MCP, por que ganhou tração, o caos de integrações customizadas | [doc 01](docs/01-visao-geral-e-mcp-vs-tools.md) |
| Integração padronizada (APIs, bancos, serviços internos; padronização de entrada/saída e contexto) | [doc 01](docs/01-visao-geral-e-mcp-vs-tools.md#integração-padronizada-entrada-saída-e-contexto) · [exemplo 02](exemplos/02-empresa-como-mcp/) |
| MCPs vs. tools tradicionais; quando usar MCP em vez de tools proprietárias | [doc 01](docs/01-visao-geral-e-mcp-vs-tools.md#mcp-vs-tools-tradicionais-function-calling--plugins) · [exemplo 03](exemplos/03-ponte-mcp-llm/) |
| MCP em JavaScript: criar e consumir; organização de código e estrutura de projeto | [doc 02](docs/02-mcp-em-javascript.md) · [exemplo 01](exemplos/01-servidor-stdio/) |
| Transformando a empresa em um "MCP" (CRM, billing, suporte, dados de produto; camada AI-ready) | [doc 03](docs/03-empresa-como-mcp-e-casos-de-uso.md) · [exemplo 02](exemplos/02-empresa-como-mcp/) · [exercício 01](exercicios/01-mcp-de-suporte/) |
| Segurança: autenticação e service tokens | [doc 04](docs/04-seguranca-e-governanca.md) · [exemplo 04](exemplos/04-mcp-http-producao/) |
| Segurança: rate limiting contra abuso e custo | [exemplo 04](exemplos/04-mcp-http-producao/) · [exercício 02](exercicios/02-escopos-e-limite-por-token/) |
| Segurança: WAF e proteções para expor MCPs | [doc 04](docs/04-seguranca-e-governanca.md#waf-e-proteções-de-borda) (WAF/gateway gerenciado: conceitual, não executado localmente; anti DNS rebinding e limite de corpo executados no exemplo 04) |
| Casos de uso reais (legado, automações, copilots internos, assistentes corporativos) | [doc 03](docs/03-empresa-como-mcp-e-casos-de-uso.md#casos-de-uso-reais-em-empresas) |
| Cenários: plugins e agentes consumindo MCPs | [exemplo 03](exemplos/03-ponte-mcp-llm/) · [exemplo 05](exemplos/05-testar-e-compor/) |
| Cenários: integração com IDEs (copilots customizados) | [doc 02](docs/02-mcp-em-javascript.md#configurando-em-clients-e-ides-copilots-customizados) (formatos JSON de Claude Desktop, Claude Code e VS Code; não instalados localmente) |
| Cenários: sistemas corporativos (ERP, CRM, suporte, analytics) | [doc 03](docs/03-empresa-como-mcp-e-casos-de-uso.md) · [exemplo 05](exemplos/05-testar-e-compor/) |
| Hands-on: MCP server do zero | [exemplo 01](exemplos/01-servidor-stdio/) · [exemplo 02](exemplos/02-empresa-como-mcp/) |
| Hands-on: integração com front-end (UI) e back-end | [exemplo 05 (`gateway.js`, BFF + página HTML)](exemplos/05-testar-e-compor/) · [doc 03](docs/03-empresa-como-mcp-e-casos-de-uso.md#integração-com-front-end-e-back-end) |
| Hands-on: testar em diferentes LLM clients e compor com outros MCPs | [exemplo 03 (LLM local)](exemplos/03-ponte-mcp-llm/) · [exemplo 05 (Inspector CLI + composição)](exemplos/05-testar-e-compor/) · [doc 02](docs/02-mcp-em-javascript.md#testando) |
| Hands-on: do zero ao MCP em produção | [exemplo 04](exemplos/04-mcp-http-producao/) · [doc 03 (roteiro)](docs/03-empresa-como-mcp-e-casos-de-uso.md#do-zero-ao-mcp-em-produção-o-roteiro) |

## Pré-requisitos

- Infra do repositório no ar (Postgres na 5433 e Ollama com `qwen3.5:4b`). A partir da raiz do repo:
  `bash infra/subir-ia.sh`.
- Node 24 (o Inspector exige `>=22.19.0`), `jq` (só para o script do Inspector).
- Dependências do módulo: `cd modulos/03-mcp && npm install`.
- Versão Python: [`uv`](https://docs.astral.sh/uv/) e Python 3.14 (fixado na raiz). `cd modulos/03-mcp && uv sync`
  cria a `.venv` do módulo a partir do `pyproject.toml`/`uv.lock` próprios (`mcp` 2.3.0, `openai` 3.33.0,
  `psycopg[binary]` 3.3.6, `starlette` 1.8.0, `uvicorn` 0.54.0, `httpx2` 2.13.1, `pytest` 9.1.1). As tabelas
  Python ficam em `m03.clientes_py` / `m03.faturas_py`.
- Variáveis (opcionais, com defaults locais): `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODELO_CHAT`, `DATABASE_URL`
  (veja `infra/.env.example`). Os dados ficam no schema `m03`.

## Como rodar

```bash
cd modulos/03-mcp
npm install

npm run ex01              # servidor stdio + client (tools, resources, prompts)
npm run ex02              # mini-CRM/billing no Postgres via MCP
npm run ex03              # LLM local (qwen3.5:4b) chamando tools MCP; lento em CPU (~6 min)
npm run ex04              # Streamable HTTP + token + rate limit + auditoria (teste ponta a ponta)
npm run ex05              # composição de 2 servidores (stdio + HTTP)
npm run ex05:inspector    # MCP Inspector em modo CLI
npm run ex05:gateway      # BFF + UI em http://127.0.0.1:30351

npm run exe01             # exercício 01: testes do MCP de suporte
npm run exe02             # exercício 02: escopos e cota por token

npm test                  # tudo que não depende do LLM (ex01, ex02, ex04, ex05, exe01, exe02)
```

Versão Python (mesma pasta):

```bash
cd modulos/03-mcp
uv sync

uv run python exemplos/01-servidor-stdio/python/client.py
uv run python exemplos/02-empresa-como-mcp/python/client.py
uv run python exemplos/03-ponte-mcp-llm/python/agente.py          # LLM local; ~25 s com o modelo já carregado
uv run python exemplos/04-mcp-http-producao/python/teste.py
uv run python exemplos/05-testar-e-compor/python/compor.py        # ou "... compor.py js": client Python + servidores JS
bash exemplos/05-testar-e-compor/python/inspector.sh              # Inspector (client JS) -> servidores Python
uv run python exemplos/05-testar-e-compor/python/gateway.py       # BFF + UI em http://127.0.0.1:30373

uv run pytest exercicios/01-mcp-de-suporte -vv                    # exercício 01 (pytest)
uv run python exercicios/02-escopos-e-limite-por-token/solucao/python/teste.py

uv run pytest                                                     # tudo que não depende do LLM (RODAR_LLM=1 inclui o ex03)
```

Portas usadas: 30340 (ex04 avulso), 30341 (teste ex04), 30350/30352 (catálogo dentro do ex05), 30351 (gateway),
30353 (Inspector), 30360/30361 (exercício 02). Python: 30370 (ex04 avulso), 30371 (teste ex04), 30372 (catálogo do
ex05), 30373/30374 (gateway e seu catálogo), 30375 (Inspector), 30380/30381 (exercício 02).

## Status de verificação

| Item | Status (JS) | Status (Python) |
|---|---|---|
| Exemplo 01 · servidor stdio + client | ✅ executado | ✅ executado |
| Exemplo 02 · empresa como MCP (Postgres `m03`) | ✅ executado | ✅ executado (tabelas `*_py`) |
| Exemplo 03 · ponte MCP → LLM com `qwen3.5:4b` | ✅ executado (Ollama local, ~6 min em CPU) | ✅ executado (Ollama local, ~25 s com o modelo carregado) |
| Exemplo 04 · HTTP + service token + rate limit + auditoria + anti DNS rebinding | ✅ executado (6 cenários com `assert`) | ✅ executado (7 cenários; Host forjado → 421, Origin → 403) |
| Exemplo 05 · Inspector CLI (stdio e HTTP), composição, BFF | ✅ executado (UI conferida via `curl`, sem navegador) | ✅ executado (+ interoperabilidade JS ↔ Python nos dois sentidos) |
| Exercício 01 · MCP de suporte + testes | ✅ executado (5/5 testes) | ✅ executado (5/5 testes pytest) |
| Exercício 02 · escopos + token bucket por plano | ✅ executado | ✅ executado |
| Configuração em Claude Desktop / Claude Code / VS Code | ⚠️ não executado localmente: só o formato do JSON (não instalamos nem logamos em clients) | ⚠️ idem |
| WAF/API gateway gerenciado, TLS, OAuth 2.1 com authorization server | ⚠️ não executado localmente: conceitual no doc 04 (exige serviço externo/conta) | ⚠️ idem |

### Armadilhas da versão Python

| Sintoma | Causa | Correção |
|---|---|---|
| `ModuleNotFoundError: No module named 'mcp.server.fastmcp'` | SDK `mcp` 2.x renomeou `FastMCP` para `MCPServer` | `from mcp.server import MCPServer` (ou fixe `mcp<2` para código antigo) |
| `ImportError` em `streamablehttp_client` / header `Authorization` não chega | 2.x renomeou para `streamable_http_client` e trocou `httpx` por `httpx2`; não há mais `headers=` | `streamable_http_client(url, http_client=httpx2.AsyncClient(headers={...}))` |
| Client Python falha com `CallToolResult.resultType Field required` | middleware devolveu um `dict` montado à mão; no protocolo 2026-07-28 o resultado leva `resultType` | devolva o modelo (`CallToolResult(...)`) e deixe o SDK serializar conforme a versão |
| `resources/list` do CRM vazio | o `MCPServer` não tem o callback `list` do `ResourceTemplate` JS | `ServerMiddleware` que completa o resultado (chega como `dict` em formato de fio) |
| Host forjado volta 421 (não 403) e conta no rate limit | no SDK Python a validação de Host/Origin fica no transport, depois da autenticação | aceite o 421 ou ponha um filtro de Host antes da auditoria/auth |
| LLM lento e caro lendo resultado de tool | `MCPServer` põe no `content` o JSON indentado | na ponte, mande `json.dumps(result.structured_content)` compacto |
| `Error executing tool X: ...` na mensagem | `ToolError` ganha esse prefixo | para texto exato, devolva `CallToolResult(is_error=True, ...)` |
| `pytest -v` não lista os testes | `addopts = "-q"` no `pyproject.toml` anula um `-v` | use `-vv` |

## Fontes

- Documentação oficial: https://modelcontextprotocol.io/docs/getting-started/intro
- Especificação 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25
- SDK TypeScript: https://github.com/modelcontextprotocol/typescript-sdk (npm: https://registry.npmjs.org/@modelcontextprotocol/sdk/latest)
- MCP Inspector: https://github.com/modelcontextprotocol/inspector
- Autorização e boas práticas de segurança: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization ·
  https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices
- SDK Python: https://py.sdk.modelcontextprotocol.io/ · migração 1.x → 2.x: https://py.sdk.modelcontextprotocol.io/migration/ ·
  PyPI: https://pypi.org/project/mcp/
- Claude Code + MCP: https://code.claude.com/docs/en/mcp · VS Code + MCP: https://code.visualstudio.com/docs/copilot/customization/mcp-servers
