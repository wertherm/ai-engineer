# Módulo 05 · Ferramentas de IA para UX & UI

Como usar IA no ciclo de interfaces **sem abrir mão da verificação**: gerar UI a partir de texto e auditá-la no
navegador, levar uma ideia até um componente testado, deixar agentes testarem a aplicação pelo MCP (com UI
interativa via MCP Apps/MCP-UI) e colocar a lógica de IA no lugar certo: o servidor, nunca a chave no browser.

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| **U1 · A revolução da IA no design e desenvolvimento de interfaces** | |
| · AI-driven UX/UI | [doc 01](docs/01-ia-no-design-e-text-to-ui.md) |
| · Panorama de ferramentas por etapa (pesquisa, ideação, prototipação, desenvolvimento, teste) | [doc 01](docs/01-ia-no-design-e-text-to-ui.md) (tabela por etapa) |
| · Casos de uso | [doc 01](docs/01-ia-no-design-e-text-to-ui.md) · exemplos [01](exemplos/01-text-to-ui-acessivel/) a [04](exemplos/04-ia-cliente-vs-servidor/) |
| **U2 · Prototipação e geração de UI com IA** | |
| · Wireframes e mockups a partir de linguagem natural (Text-to-UI) | [doc 01](docs/01-ia-no-design-e-text-to-ui.md) · [exemplo 01](exemplos/01-text-to-ui-acessivel/) |
| · Prototipação visual assistida | [doc 01](docs/01-ia-no-design-e-text-to-ui.md) · [exemplo 01](exemplos/01-text-to-ui-acessivel/) (screenshots v1/v2) |
| · **Mão na massa: Firebase Studio transformando designs do Figma em código** | [doc 01](docs/01-ia-no-design-e-text-to-ui.md) — ⚠️ **não executado localmente** (plataforma externa com login; em descontinuação: novos workspaces e importação desativados desde 22/06/2026) |
| · Validação de usabilidade e fluxos com IA | [doc 01](docs/01-ia-no-design-e-text-to-ui.md) · [exemplo 01](exemplos/01-text-to-ui-acessivel/) (axe-core) · [exemplo 03](exemplos/03-app-com-mcp-e2e/) (fluxo por agente) · [exercício 01](exercicios/01-componente-acessivel/) |
| **U3 · Agentes de IA e CLI no front-end** | |
| · Agentes de codificação no ambiente de desenvolvimento | [doc 02](docs/02-agentes-e-cli-no-front-end.md) |
| · **Gemini CLI** para scaffolding, componentes e refatoração | [doc 02](docs/02-agentes-e-cli-no-front-end.md) · [`GEMINI.md` e `settings.json` de exemplo](exemplos/02-ideia-ao-componente-testavel/gemini/) — ⚠️ **não executado localmente** (exige login Google ou chave) |
| · Fluxo da ideia ao componente funcional e testável | [doc 02](docs/02-agentes-e-cli-no-front-end.md) · [exemplo 02](exemplos/02-ideia-ao-componente-testavel/) |
| · Prompt engineering para gerar HTML, CSS, JS/TS | [doc 02](docs/02-agentes-e-cli-no-front-end.md) (tabela de técnicas) · exemplos [01](exemplos/01-text-to-ui-acessivel/) e [02](exemplos/02-ideia-ao-componente-testavel/) |
| **U4 · Automação e interação inteligente com a UI** | |
| · Testes E2E com agentes que consomem o MCP da aplicação | [doc 03](docs/03-mcp-na-ui-e-testes-e2e.md) · [exemplo 03](exemplos/03-app-com-mcp-e2e/) · [exercício 02](exercicios/02-tool-mcp-e-teste-e2e/) |
| · **mcpui.dev** (MCP-UI / MCP Apps) para visualizar e interagir com o contexto via MCP | [doc 03](docs/03-mcp-na-ui-e-testes-e2e.md) · [exemplo 03](exemplos/03-app-com-mcp-e2e/) (`@mcp-ui/server`, recurso `ui://tarefas/painel` + mini-host) |
| **U5 · Lógica de IA no cliente e no servidor** | |
| · Consumir APIs de IA do front-end e os riscos (chave exposta) | [doc 04](docs/04-ia-no-cliente-e-no-servidor.md) · [exemplo 04](exemplos/04-ia-cliente-vs-servidor/) (`anti-padrao-chave-no-browser.html` + verificação de vazamento) |
| · **Firebase AI Logic** para backends com IA | [doc 04](docs/04-ia-no-cliente-e-no-servidor.md) — ⚠️ **não executado localmente** (exige projeto Firebase e login) |
| · Features inteligentes: busca semântica, chatbot de suporte, personalização em tempo real | [doc 04](docs/04-ia-no-cliente-e-no-servidor.md) · [exemplo 04](exemplos/04-ia-cliente-vs-servidor/) |
| · Mão na massa: app que processa inputs do usuário com lógica de IA no servidor | [exemplo 04](exemplos/04-ia-cliente-vs-servidor/) |

## Pré-requisitos

- Infra do repositório no ar (Ollama com `qwen3.5:4b` e `qwen3-embedding:0.6b`; Postgres + pgvector), a partir
  da **raiz** do repositório: `bash infra/subir-ia.sh`. O exemplo 04 usa só o schema `m05`.
- Node 24 e npm 11. Na pasta do módulo: `npm install` (~87 MB; o `.npmrc` pula o Bun opcional de ~170 MB).
- **Google Chrome instalado** (`/usr/bin/google-chrome`): o `playwright-core` usa `channel: 'chrome'`; nenhum
  browser é baixado.
- Variáveis opcionais (defaults apontam para a infra local): `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODELO_CHAT`,
  `MODELO_EMBED`, `DATABASE_URL` (veja [`infra/.env.example`](../../infra/.env.example)).
- Paciência com a CPU: cada chamada ao LLM leva de 15 s a 3 min (mais se o Ollama estiver ocupado).
  Portas usadas: 30510–30530.

| Dependência | Versão |
|---|---|
| openai · undici | 7.36.0 · 8.12.2 |
| playwright-core · @axe-core/playwright | 1.64.1 · 4.14.0 |
| @modelcontextprotocol/sdk · @mcp-ui/server | 1.32.1 · 6.1.0 |
| express · zod | 5.3.0 · 4.6.7 |
| pg · pgvector | 8.23.1 · 0.3.0 |

## Como rodar

```bash
cd modulos/05-ia-ux-ui
npm install

npm test                # testes determinísticos, sem LLM (~15 s): auditoria, E2E com MCP/MCP-UI, exercício 02

npm run ex01            # Text-to-UI: gera, renderiza, audita e corrige (2 chamadas ao LLM)
npm run ex02            # spec -> componente + teste gerados pelo LLM -> node --test (2 chamadas)
npm run ex03            # agente planeja e executa um E2E pela UI + MCP (1 chamada)
npm run ex04            # busca semântica + chatbot no servidor, verificação de vazamento e rate limit (1 chamada)
npm run exe01           # exercício 01: corrigir componente até nota 100 (até 3 chamadas)
npm run exe02           # exercício 02: tool MCP nova + E2E (sem LLM)

npm run ex03:server     # app de tarefas manual: http://127.0.0.1:30510 (MCP em /mcp, Bearer tok-e2e-demo)
npm run ex04:server     # central de ajuda manual: http://127.0.0.1:30520
```

## Status de verificação

| Item | Status |
|---|---|
| `npm test` (juiz de acessibilidade, E2E UI+MCP+MCP-UI, exercício 02, aceitação da correção humana) | ✅ executado: 14 testes passando |
| Exemplo 01 · Text-to-UI acessível | ✅ executado: nota 85 → 100 após o feedback do axe |
| Exemplo 02 · Ideia → componente testável | ✅ executado: o LLM errou (sem `aria-current`; testes sem imports); a aceitação **reprovou** (`npm run ex02` sai com código 1, de propósito) e a correção humana passa 4/4 |
| Exemplo 03 · Agente E2E + MCP + MCP-UI | ✅ executado: plano de 6 passos, fluxo aprovado |
| Exemplo 04 · IA no servidor (busca, chatbot, personalização) | ✅ executado: chave não vazou, 400 na entrada grande, 429 na rajada |
| Exercício 01 · Componente até nota 100 | ✅ executado: 0 → 100 em 1 tentativa (com revisão humana documentada) |
| Exercício 02 · Tool MCP nova + E2E | ✅ executado: 3/3 |
| Firebase Studio (Figma → código) | ⚠️ não executado localmente: exige login Google/Figma e está em descontinuação (novos workspaces e importação desativados desde 22/06/2026) |
| Gemini CLI | ⚠️ não executado localmente: exige login Google ou chave; só `gemini --version` e `--help` (0.53.0) rodaram |
| Firebase AI Logic | ⚠️ não executado localmente: exige projeto Firebase, login e provedor Gemini |
| Host MCP Apps real (Claude, VS Code, MCPJam...) | ⚠️ não executado localmente: o recurso `ui://` foi testado com a mini-host própria (`cliente-mcp.js`) |

## Fontes

- MCP Apps: https://modelcontextprotocol.io/extensions/apps/overview · MCP-UI: https://mcpui.dev
- `@mcp-ui/server`: https://www.npmjs.com/package/@mcp-ui/server
- axe-core / `@axe-core/playwright`: https://github.com/dequelabs/axe-core-npm
- Playwright (locators): https://playwright.dev/docs/locators
- Gemini CLI: https://geminicli.com/docs/
- Firebase Studio: https://firebase.google.com/docs/studio · migração: https://firebase.google.com/docs/studio/migrating-project
- Firebase AI Logic: https://firebase.google.com/docs/ai-logic
- WCAG 2.1: https://www.w3.org/TR/WCAG21/
- OWASP Top 10 para LLMs: https://genai.owasp.org/llm-top-10/
