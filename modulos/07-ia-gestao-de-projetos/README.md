# Módulo 07 · Ferramentas de IA para Gestão de Projetos

Como usar IA no ciclo de vida de um projeto (requisitos, priorização, cronograma, previsão, riscos, reuniões,
status reports, governança, automação de boards e OKRs) seguindo uma regra só: **o LLM extrai e propõe,
o código determinístico calcula, valida e decide**. Tudo em JavaScript (Node 24) e também em Python 3.14 (subpastas `python/`), com LLM local.

Estudado em 2026-10-16 com `openai` **7.34.0**, `zod` **4.6.7**, `express` **5.3.0**, `pg` **8.23.1**,
Node **24.11.1** e o modelo `qwen3.5:4b` (Ollama). Testes com `node:test` (nativo, sem dependência).

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| **U1** IA para levantar e definir requisitos | [doc 01](docs/01-requisitos-priorizacao-e-okrs.md#u1--requirements-copilot) · [exemplo 01](exemplos/01-requirements-copilot/) |
| U1 Linguagem natural → épicos, histórias de usuário e requisitos de mudança | [exemplo 01](exemplos/01-requirements-copilot/) |
| U1 Decomposição de tarefas e critérios de aceite | [exemplo 01](exemplos/01-requirements-copilot/) (tarefas + Dado/Quando/Então + auditoria) |
| **U2** RICE, WSJF e MoSCoW com apoio de IA | [doc 01](docs/01-requisitos-priorizacao-e-okrs.md#u2--priorização-inteligente) · [exemplo 02](exemplos/02-priorizacao-rice-wsjf/) |
| U2 Simular impacto e sugerir roadmap | [exemplo 02](exemplos/02-priorizacao-rice-wsjf/) (what-if de confiança + roadmap por capacidade/dependência) |
| U2 Pontuação inteligente para refinamento | [exemplo 02](exemplos/02-priorizacao-rice-wsjf/) (score em código, justificativa pelo LLM) |
| **U3** Cronogramas dinâmicos e dependências | [doc 02](docs/02-cronograma-estimativas-e-riscos.md#u3--cronograma-dependências-e-capacidade) · [exemplo 03](exemplos/03-cronograma-monte-carlo/) (CPM, caminho crítico) |
| U3 Cenários what-if e balanceamento de capacidade | [exemplo 03](exemplos/03-cronograma-monte-carlo/) |
| U3 Ajustes automáticos por previsões de carga | [exemplo 03](exemplos/03-cronograma-monte-carlo/) (sugestão de corte de escopo quando o P85 estoura o alvo) |
| **U4** Previsão de prazo, custo e esforço | [doc 02](docs/02-cronograma-estimativas-e-riscos.md#u4--estimativas-e-previsões-com-monte-carlo) · [exemplo 03](exemplos/03-cronograma-monte-carlo/) · CPI em [exemplo 04](exemplos/04-reuniao-ata-status-report/) |
| U4 Dados históricos para melhorar a acurácia | [exemplo 03](exemplos/03-cronograma-monte-carlo/) (throughput histórico) · [doc 02](docs/02-cronograma-estimativas-e-riscos.md) (calibrar estimado × real) |
| U4 Simulação Monte Carlo para incerteza | [exemplo 03](exemplos/03-cronograma-monte-carlo/) (três pontos e throughput, P50/P85/P95) |
| **U5** Detecção automática de riscos de escopo, cronograma e recursos | [doc 02](docs/02-cronograma-estimativas-e-riscos.md#u5--riscos-e-mitigações-aiops-de-projeto) · [exercício 01](exercicios/01-detector-risco-cronograma/) |
| U5 Padrões e anomalias em dados de projeto | [exercício 01](exercicios/01-detector-risco-cronograma/) (z-score robusto + tendência) |
| U5 Planos de mitigação a partir de histórico e heurísticas | [exercício 01](exercicios/01-detector-risco-cronograma/) (tabela de mitigações por tipo) |
| **U6** Transcrever e resumir reuniões | [doc 03](docs/03-reunioes-e-status-reports.md#u6--reunião--ata--calendárioboard) · [exemplo 04](exemplos/04-reuniao-ata-status-report/) (a partir de transcrição em texto; Whisper ⚠️ não executado localmente: sem áudio de exemplo nem TTS para gerar um) |
| U6 Extrair decisões, pendências e ações | [exemplo 04](exemplos/04-reuniao-ata-status-report/) (schema com enums de responsável e data) |
| U6 Integrar a calendários e boards | [exemplo 04](exemplos/04-reuniao-ata-status-report/) (`.ics`) · [exemplo 05](exemplos/05-bot-cards-aprovacao/) (cards) |
| **U7** Relatórios automáticos de sprint/projeto/portfólio | [doc 03](docs/03-reunioes-e-status-reports.md#u7--status-reports-e-executive-summaries) · [exemplo 04](exemplos/04-reuniao-ata-status-report/) (sprint; portfólio é conceitual no doc) |
| U7 Adaptar para públicos (técnico, gestor, diretoria) | [exemplo 04](exemplos/04-reuniao-ata-status-report/) |
| U7 Consolidar dados em linguagem natural | [exemplo 04](exemplos/04-reuniao-ata-status-report/) (métricas em código + texto do LLM + checagem numérica) |
| **U8** Conformidade e rastreabilidade | [doc 04](docs/04-automacao-governanca-e-integracoes.md#u8--governança-compliance-e-qualidade) · [exercício 02](exercicios/02-checklist-governanca/) |
| U8 Checklists automatizados e trilhas de decisão | [exercício 02](exercicios/02-checklist-governanca/) · trilha com hash em [exemplo 05](exemplos/05-bot-cards-aprovacao/) |
| U8 Documentação de qualidade | [doc 04](docs/04-automacao-governanca-e-integracoes.md) (ADR, Keep a Changelog, SemVer) · [exercício 02](exercicios/02-checklist-governanca/) |
| U8 Verificações em JavaScript para auditoria e controle de versões | [exercício 02](exercicios/02-checklist-governanca/) (versão × CHANGELOG, deps exatas, tag git) |
| **U9** Automações integradas (Jira/Asana/Trello/Notion/Slack) | [doc 04](docs/04-automacao-governanca-e-integracoes.md#integrações-reais-código-pronto-não-executado-localmente) · `integracoes-reais.js` no [exemplo 05](exemplos/05-bot-cards-aprovacao/) ⚠️ não executado localmente (exige contas e tokens) |
| U9 Bots em JS para criar/atualizar/priorizar cards | [exemplo 05](exemplos/05-bot-cards-aprovacao/) (contra mock local da API do Trello) |
| U9 Linguagem natural → workflow | [exemplo 05](exemplos/05-bot-cards-aprovacao/) |
| U9 Regras de lembretes, notificações e aprovações | [exemplo 05](exemplos/05-bot-cards-aprovacao/) (`politica.js`; payload Slack impresso, não enviado) |
| **U10** Alinhar projetos a OKRs | [doc 01](docs/01-requisitos-priorizacao-e-okrs.md#u10--portfólio-e-okrs) · [exemplo 02](exemplos/02-priorizacao-rice-wsjf/) |
| U10 Métricas de outcome e priorização de iniciativas | [exemplo 02](exemplos/02-priorizacao-rice-wsjf/) (esforço por KR, KR sem iniciativa, item sem KR → Won't) |
| U10 Avaliar impacto e propor ajustes | [doc 01](docs/01-requisitos-priorizacao-e-okrs.md#u10--portfólio-e-okrs) · what-if do [exemplo 02](exemplos/02-priorizacao-rice-wsjf/) |

## Pré-requisitos

- Infra do repositório no ar (Ollama com `qwen3.5:4b` e Postgres na 5433). A partir da raiz do repo:
  `bash infra/subir-ia.sh`.
- Node 24 e as dependências do módulo: `cd modulos/07-ia-gestao-de-projetos && npm install`.
- Variáveis opcionais (defaults locais, veja `infra/.env.example`): `OPENAI_BASE_URL`, `OPENAI_API_KEY`,
  `MODELO_CHAT`, `DATABASE_URL`. Os dados do módulo ficam no schema `m07`. Porta usada: 30707 (mock do Trello).
- Versão Python (opcional): [`uv`](https://docs.astral.sh/uv/) e Python 3.14. `uv sync` na pasta do módulo instala
  `openai` 3.34.0, `pydantic` 2.14.1, `fastapi` 0.143.3, `uvicorn` 0.54.0, `httpx` 0.28.1, `psycopg[binary]` 3.3.6
  e `pytest` 9.1.1 (projeto próprio em `pyproject.toml`, `uv.lock` versionado). Porta do mock Python: 30750;
  trilha Python na tabela `m07.trilha_bot_py`.
- Paciência com a CPU: o `qwen3.5:4b` gera ~5 tokens/s. Exemplo 01 ≈ 4 min, 04 ≈ 5 min, 05 ≈ 1 min por pedido.

## Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
npm install
npm test                      # 24 testes, sem LLM (funções puras)

npm run ex01                  # requirements copilot (LLM)
npm run ex02                  # RICE/WSJF/MoSCoW/roadmap/OKR (+ justificativa pelo LLM)
npm run ex03                  # CPM + Monte Carlo (sem LLM)
npm run ex04                  # reunião → ata → .ics → status report (LLM)

npm run mock-trello &         # mock da API do Trello na porta 30707
npm run ex05                                                                # bot: criar + mover
npm run ex05 -- "Arquive o card Tema escuro no portal"                      # aguardando aprovação
npm run ex05 -- "Arquive o card Tema escuro no portal" --aprovador=marina   # executa
npm run auditar-trilha
kill %1                       # para o mock

npm run exe01                 # exercício 01: detector de risco
npm run exe02                 # exercício 02: checklist de governança (sai com código 1: há falhas plantadas)
```

Versão Python (cada exemplo/solução tem uma subpasta `python/` com o equivalente):

```bash
cd modulos/07-ia-gestao-de-projetos
uv sync
uv run pytest                 # 28 testes (os 24 do JS + 4 de equivalência com o JS), sem LLM

uv run python exemplos/01-requirements-copilot/python/main.py
uv run python exemplos/02-priorizacao-rice-wsjf/python/main.py
uv run python exemplos/03-cronograma-monte-carlo/python/main.py
uv run python exemplos/04-reuniao-ata-status-report/python/main.py

uv run python exemplos/05-bot-cards-aprovacao/python/mock_trello.py &   # FastAPI na porta 30750
uv run python exemplos/05-bot-cards-aprovacao/python/bot.py
uv run python exemplos/05-bot-cards-aprovacao/python/bot.py "Arquive o card Tema escuro no portal"
uv run python exemplos/05-bot-cards-aprovacao/python/bot.py "Arquive o card Tema escuro no portal" --aprovador=marina
uv run python exemplos/05-bot-cards-aprovacao/python/auditar_trilha.py
kill %1

uv run python exercicios/01-detector-risco-cronograma/solucao/python/main.py
uv run python exercicios/02-checklist-governanca/solucao/python/main.py   # sai com código 1 de propósito
```

O código Python compartilhado fica em [`comum_py/`](comum_py/): `llm.py` (`extrair_json` com structured output via
pydantic e `gerar_texto`), `js.py` (`js_round`/`to_fixed`, arredondamentos com a semântica do JS) e `tabela.py`.

O código compartilhado de LLM fica em [`lib/llm.js`](lib/llm.js) (`extrairJson` com structured output via
zod e `gerarTexto`).

## Status de verificação

| Item | JS | Python |
|---|---|---|
| Exemplo 01 · Requirements Copilot | ✅ executado (LLM local) + teste | ✅ executado (backlog idêntico ao JS) + 2 testes |
| Exemplo 02 · Priorização RICE/WSJF/MoSCoW + OKR | ✅ executado + 4 testes | ✅ executado (números iguais ao JS) + 4 testes |
| Exemplo 03 · Cronograma + Monte Carlo | ✅ executado + 4 testes | ✅ executado (P50/P85/P95 bit a bit iguais) + 6 testes |
| Exemplo 04 · Reunião → ata → .ics → status report | ✅ executado + 6 testes | ✅ executado + 7 testes |
| Exemplo 04 · Transcrição de áudio com Whisper | ⚠️ não executado localmente: sem gravação de reunião de exemplo nem TTS na máquina para gerar uma | ⚠️ idem |
| Exemplo 05 · Bot + mock Trello + aprovação + trilha no Postgres | ✅ executado (3 pedidos, auditoria e adulteração detectada) + 3 testes | ✅ executado (mock FastAPI, `m07.trilha_bot_py`, adulteração detectada) + 4 testes (1 confere o hash contra o JS) |
| Exemplo 05 · `integracoes-reais.js` (Jira, Slack, Asana, Notion, Trello real) | ⚠️ não executado localmente: exige contas e tokens dos serviços | ⚠️ `integracoes_reais.py`: idem |
| Exercício 01 · Detector de risco de cronograma | ✅ executado + 4 testes | ✅ executado (saída idêntica) + 4 testes |
| Exercício 02 · Checklist de governança | ✅ executado + 1 teste | ✅ executado (exit 1 de propósito) + 1 teste |

## Fontes

- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- SDK openai-node: https://github.com/openai/openai-node
- Ollama, structured outputs e compatibilidade OpenAI: https://docs.ollama.com/capabilities/structured-outputs · https://docs.ollama.com/api/openai-compatibility
- Zod → JSON Schema: https://zod.dev/json-schema
- RICE: https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/ · WSJF: https://framework.scaledagile.com/wsjf
- Critical Path Method: https://en.wikipedia.org/wiki/Critical_path_method · outliers (NIST): https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm
- iCalendar RFC 5545: https://datatracker.ietf.org/doc/html/rfc5545
- Trello REST: https://developer.atlassian.com/cloud/trello/rest/api-group-cards/ · Jira REST v3: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
- Slack chat.postMessage: https://docs.slack.dev/reference/methods/chat.postMessage · Asana: https://developers.asana.com/reference/createtask · Notion: https://developers.notion.com/reference/post-page
- ADR: https://adr.github.io/ · Keep a Changelog: https://keepachangelog.com/pt-BR/1.1.0/
- Versão Python: OpenAI Python SDK https://github.com/openai/openai-python · pydantic https://docs.pydantic.dev/latest/ · FastAPI https://fastapi.tiangolo.com/ · psycopg 3 https://www.psycopg.org/psycopg3/docs/ · pytest https://docs.pytest.org/ · uv https://docs.astral.sh/uv/
- node:test: https://nodejs.org/api/test.html · node-postgres: https://node-postgres.com/ · Express 5: https://expressjs.com/en/5x/api.html
- Ligações no repo: [LLMOps (avaliação, custo, métricas)](../../trilhas-extras/llmops-vllm-openshift/) · [MLOps (drift, tracking)](../../trilhas-extras/mlops/)
