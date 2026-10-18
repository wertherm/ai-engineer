# Módulo 04 · Criação de Agentes Autônomos

Como construir agentes que percebem, raciocinam, agem e aprendem com o feedback: do loop escrito à mão
(function calling) a grafos LangGraph.js com memória no pgvector, gestão de contexto, human-in-the-loop,
guardrails, auditoria e sistemas multiagente, tudo rodando com um LLM local.

Estudado em 2026-10-16 com `@langchain/langgraph` **1.5.0**, `langchain` **1.5.18**, `openai` **7.34.0** e
o modelo local `qwen3.5:4b` (Ollama). Versão Python (2026-10-17): `langgraph` **1.2.16**, `langchain` **1.4.6**,
`openai` **3.35.0**, `mcp` **2.3.0**, Python 3.14.

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| **U1 · Arquitetura de agents** | |
| Agent loop (percepção → raciocínio → ação → feedback) | [doc 01](docs/01-arquitetura-e-padroes-de-raciocinio.md#o-agent-loop) · [exemplo 01](exemplos/01-agent-loop-do-zero/) |
| Estrutura interna: planner, executor, memory store, toolbox | [doc 01](docs/01-arquitetura-e-padroes-de-raciocinio.md#estrutura-interna) · [exemplo 01](exemplos/01-agent-loop-do-zero/) |
| Tipos: task-based, interactive, goal-oriented, autonomous | [doc 01](docs/01-arquitetura-e-padroes-de-raciocinio.md#tipos-de-agente) (conceitual) |
| Componentização (prompts, ferramentas, contexto, feedback loops) | [doc 01](docs/01-arquitetura-e-padroes-de-raciocinio.md#estrutura-interna) · [exemplo 01](exemplos/01-agent-loop-do-zero/) · [exemplo 05](exemplos/05-gerenciamento-de-contexto/) |
| **U2 · Padrões de raciocínio e execução** | |
| ReAct (reasoning traces) | [doc 01](docs/01-arquitetura-e-padroes-de-raciocinio.md#padrões-de-raciocínio-e-execução) · [exemplo 02](exemplos/02-react-vs-plan-execute/) |
| Plan-and-Execute | [doc 01](docs/01-arquitetura-e-padroes-de-raciocinio.md#padrões-de-raciocínio-e-execução) · [exemplo 02](exemplos/02-react-vs-plan-execute/) |
| Reflection (autoavaliação e correção) | [doc 01](docs/01-arquitetura-e-padroes-de-raciocinio.md#padrões-de-raciocínio-e-execução) · [exemplo 04](exemplos/04-reflection-e-memoria/) |
| Comparativo prático ReAct × Plan-Execute | [doc 01](docs/01-arquitetura-e-padroes-de-raciocinio.md#comparativo-prático-números-reais-do-exemplo-02) · [exemplo 02](exemplos/02-react-vs-plan-execute/) (números medidos) |
| Implementações com LangChain, LangGraph e equivalentes | [doc 01](docs/01-arquitetura-e-padroes-de-raciocinio.md#frameworks-langchain-langgraph-e-equivalentes) · [exemplo 02 (`createAgent`)](exemplos/02-react-vs-plan-execute/) · [exemplo 06 (LangGraph)](exemplos/06-langgraph-hitl-guardrails/) |
| **U3 · Function calling e tool use** | |
| Princípios de function calling | [doc 02](docs/02-tools-memoria-e-contexto.md#function-calling-e-tool-use) · [exemplo 01](exemplos/01-agent-loop-do-zero/) |
| Design de schemas JSON para funções | [doc 02](docs/02-tools-memoria-e-contexto.md#design-de-schemas-json) · [exemplo 01](exemplos/01-agent-loop-do-zero/) · [exercício 01](exercicios/01-tool-nova-e-orcamento/) |
| Conectar agentes a APIs REST, bancos de dados, automações e MCPs | [doc 02](docs/02-tools-memoria-e-contexto.md#conectando-o-agente-ao-mundo) · [exemplo 03](exemplos/03-tools-externas/) |
| Agente que cria, executa e ajusta tarefas com ferramentas externas | [exemplo 03](exemplos/03-tools-externas/) |
| **U4 · Memória e reflexão** | |
| Memória curta, longa, episódica e contextual | [doc 02](docs/02-tools-memoria-e-contexto.md#memória) · [exemplo 04](exemplos/04-reflection-e-memoria/) |
| Armazenamento e recuperação via embeddings | [doc 02](docs/02-tools-memoria-e-contexto.md#memória) · [exemplo 04](exemplos/04-reflection-e-memoria/) (pgvector, schema `m04`) |
| Reflection loops | [exemplo 04](exemplos/04-reflection-e-memoria/) |
| Casos: assistentes pessoais, debugging automatizado, aprendizado incremental | [doc 02](docs/02-tools-memoria-e-contexto.md#memória) (conceitual; o exemplo 04 é o caso "assistente pessoal") |
| **U5 · Gerenciamento de contextos** | |
| "Contexto ativo" | [doc 02](docs/02-tools-memoria-e-contexto.md#gerenciamento-de-contexto) · [exemplo 05](exemplos/05-gerenciamento-de-contexto/) |
| Context pruning e context stitching | [exemplo 05](exemplos/05-gerenciamento-de-contexto/) |
| Contexto compartilhado entre agentes | [doc 02](docs/02-tools-memoria-e-contexto.md#gerenciamento-de-contexto) · [exemplo 05](exemplos/05-gerenciamento-de-contexto/) · [exemplo 07](exemplos/07-multiagente-supervisor/) |
| Contexto global × local | [exemplo 05](exemplos/05-gerenciamento-de-contexto/) |
| **U6 · LangGraph e workflows complexos** | |
| LangGraph como orquestrador | [doc 03](docs/03-langgraph-observabilidade-e-limites.md#por-que-um-grafo) · [exemplo 06](exemplos/06-langgraph-hitl-guardrails/) |
| Grafos de execução e dependências | [doc 03](docs/03-langgraph-observabilidade-e-limites.md#grafos-de-execução-e-dependências) · [exercício 02](exercicios/02-linear-para-langgraph/) |
| Roteamento, fallback handlers e retry | [exemplo 06](exemplos/06-langgraph-hitl-guardrails/) · [exercício 02](exercicios/02-linear-para-langgraph/) |
| Monitoramento e depuração de agentes em grafo | [doc 03](docs/03-langgraph-observabilidade-e-limites.md#monitoramento-e-depuração) · [exemplo 06](exemplos/06-langgraph-hitl-guardrails/) (`stream` updates, `getState`, `getStateHistory`) |
| **U7 · Observabilidade e limites de autonomia** | |
| Métricas e logs de execução | [doc 03](docs/03-langgraph-observabilidade-e-limites.md#observabilidade-métricas-e-logs-de-execução) · todos os exemplos imprimem chamadas, tokens e tempo |
| Auditoria e rastreabilidade de decisões | [doc 03](docs/03-langgraph-observabilidade-e-limites.md#auditoria-e-rastreabilidade-de-decisões) · [exemplo 06](exemplos/06-langgraph-hitl-guardrails/) (`m04.auditoria`) |
| Guardrails e human-in-the-loop | [exemplo 06](exemplos/06-langgraph-hitl-guardrails/) · [exercício 01](exercicios/01-tool-nova-e-orcamento/) |
| Delimitação de escopo e ética | [doc 03](docs/03-langgraph-observabilidade-e-limites.md#guardrails-escopo-e-ética) · [exemplo 06](exemplos/06-langgraph-hitl-guardrails/) (guardrail de entrada) |
| Prevenção de runaway loops e abuso de API | [doc 03](docs/03-langgraph-observabilidade-e-limites.md#runaway-loops-e-abuso-de-api) · [exercício 01](exercicios/01-tool-nova-e-orcamento/) · [exemplo 07](exemplos/07-multiagente-supervisor/) |
| **U8 · Projeto Prático: Agent que Automatiza Tarefas Complexas** | fora do escopo deste repositório, a pedido |
| **U9 · Multi-agent systems** | |
| Orquestração, coordenação e negociação | [doc 04](docs/04-sistemas-multiagente.md#orquestração-coordenação-e-negociação) · [exemplo 07](exemplos/07-multiagente-supervisor/) |
| Padrões Supervisor, Hierarchical, Group Chat, Delegation, Consensus | [doc 04](docs/04-sistemas-multiagente.md#padrões) (Supervisor e Delegation executados no exemplo 07; os demais conceituais) |
| Comunicação assíncrona | [doc 04](docs/04-sistemas-multiagente.md#comunicação-assíncrona) · [exemplo 07](exemplos/07-multiagente-supervisor/) |
| Mini sistema cooperativo (analista → planejador → executor) | [exemplo 07](exemplos/07-multiagente-supervisor/) |
| Casos reais (Claude Team, AutoGPT, CrewAI, Agentarium) | [doc 04](docs/04-sistemas-multiagente.md#casos-reais) (conceitual; não executado localmente: são produtos/frameworks externos) |

## Pré-requisitos

- Infra do repositório no ar (Ollama com `qwen3.5:4b` e `qwen3-embedding:0.6b`, Postgres+pgvector na 5433).
  A partir da raiz do repo: `bash infra/subir-ia.sh`.
- Node 24 (`@langchain/openai` e `pgvector` exigem Node >= 22).
- Dependências: `cd modulos/04-agentes-autonomos && npm install`.
- Versão Python (opcional): [`uv`](https://docs.astral.sh/uv/) e Python 3.14; o módulo tem `pyproject.toml` e
  `uv.lock` próprios (`uv sync` na pasta do módulo). Código compartilhado em [`comum_py/`](comum_py/).
- Variáveis opcionais (defaults locais, veja `infra/.env.example`): `OPENAI_BASE_URL`, `OPENAI_API_KEY`,
  `MODELO_CHAT`, `MODELO_EMBED`, `DATABASE_URL`. Os dados ficam só no schema `m04`.
- Paciência: o modelo roda em CPU (~5 tokens/s). Cada chamada leva de 30 s a vários minutos, conforme a
  carga do Ollama. Todo exemplo tem limite de passos e `max_tokens` baixo.
- Bom ter feito o [módulo 03 · MCP](../03-mcp/) (o exemplo 03 consome um servidor MCP).

## Como rodar

```bash
cd modulos/04-agentes-autonomos
npm install

npm run ex01            # agent loop do zero com function calling e trace
npm run ex02            # ReAct x Plan-and-Execute na mesma tarefa (tabela comparativa)
npm run ex02:langchain  # o mesmo ReAct com LangChain v1 (createAgent)
npm run ex03            # tools externas: API REST (porta 30400) + Postgres + servidor MCP
npm run ex04:s1         # reflection + grava memória longa/episódica no pgvector
npm run ex04:s2         # nova execução: recupera memórias por embedding
npm run ex05            # contexto: pruning, sumarização, stitching, global x local
npm run ex06            # LangGraph: roteamento, retry, fallback, checkpoint, HITL, guardrails, auditoria
npm run ex07            # multiagente: supervisor + analista -> planejador -> executor (assíncrono)

npm run exe01           # exercício 01: tool nova + guardrail de orçamento
npm run exe02           # exercício 02: agente linear -> grafo LangGraph com fallback

npm run tudo            # tudo em sequência (lento: ~30+ min em CPU)
```

Versão Python (mesmos exemplos, pastas `python/`; tabelas `_py` no schema `m04`):

```bash
cd modulos/04-agentes-autonomos
uv sync

uv run python exemplos/01-agent-loop-do-zero/python/main.py
uv run python exemplos/02-react-vs-plan-execute/python/main.py
uv run python exemplos/02-react-vs-plan-execute/python/react_langchain.py   # langchain.agents.create_agent
uv run python exemplos/03-tools-externas/python/main.py                     # FastAPI na porta 30450 + MCP stdio
uv run python exemplos/04-reflection-e-memoria/python/main.py 1
uv run python exemplos/04-reflection-e-memoria/python/main.py 2
uv run python exemplos/05-gerenciamento-de-contexto/python/main.py
uv run python exemplos/06-langgraph-hitl-guardrails/python/main.py
uv run python exemplos/07-multiagente-supervisor/python/main.py

uv run python exercicios/01-tool-nova-e-orcamento/solucao/python/main.py
uv run python exercicios/02-linear-para-langgraph/inicial/python/linear.py
uv run python exercicios/02-linear-para-langgraph/solucao/python/main.py

uv run pytest            # testes sem LLM (contexto, grafo com chat falso, executor multiagente)
```

Portas usadas: 30400 (API REST do exemplo 03 em JS) e 30450 (a mesma API em FastAPI, versão Python); as duas
sobem e descem dentro do próprio script.

## Status de verificação

| Item | Status |
|---|---|
| Exemplo 01 · agent loop do zero | ✅ executado (2 chamadas ao LLM) |
| Exemplo 02 · ReAct × Plan-and-Execute | ✅ executado (ReAct 6 chamadas/5195 tokens; Plan-Execute 1 chamada/377 tokens; ambos 6450) |
| Exemplo 02 · ReAct com LangChain `createAgent` | ✅ executado (3 chamadas, tools em paralelo, 6450) |
| Exemplo 03 · REST + Postgres + MCP | ✅ executado (tarefa criada, ajustada para alta, notificação via MCP, concluída) |
| Exemplo 04 · Reflection + memória pgvector (2 sessões) | ✅ executado |
| Exemplo 05 · pruning, sumarização, stitching | ✅ executado (janela: "não sei"; costurado: "8812, 40 caixas") |
| Exemplo 06 · LangGraph com retry, fallback, checkpoint, HITL, guardrails, auditoria | ✅ executado (3 cenários, auditoria em `m04.auditoria`) |
| Exemplo 07 · multiagente supervisor assíncrono | ✅ executado (replanejamento por orçamento) |
| Exercício 01 · tool nova + orçamento | ✅ executado (asserts ok) |
| Exercício 02 · linear → LangGraph com fallback | ✅ executado (3 caminhos com asserts) |
| **Python** · Exemplo 01 (`python/main.py`) | ✅ executado (2 chamadas, 923 tokens de prompt, igual ao JS) |
| **Python** · Exemplo 02 · ReAct × Plan-and-Execute | ✅ executado (ReAct 6 chamadas/5195 tokens; Plan-Execute 1/377; ambos 6450) |
| **Python** · Exemplo 02 · `langchain.agents.create_agent` | ✅ executado (3 chamadas, tools em paralelo, 6450) |
| **Python** · Exemplo 03 · FastAPI + Postgres + MCP (`mcp` 2.3.0) | ✅ executado (mesmo fluxo; `m04.tarefas_py`/`notificacoes_py`) |
| **Python** · Exemplo 04 · Reflection + pgvector (2 sessões) | ✅ executado (`m04.memorias_py`; distância 0,556 na sessão 2) |
| **Python** · Exemplo 05 · pruning, sumarização, stitching | ✅ executado + 4 testes pytest |
| **Python** · Exemplo 06 · LangGraph Python (retry, `error_handler`, HITL, auditoria) | ✅ executado (`m04.auditoria_py`) + 4 testes pytest |
| **Python** · Exemplo 07 · multiagente com `asyncio.Queue` | ✅ executado (replanejamento por orçamento) + 1 teste pytest |
| **Python** · Exercício 01 | ✅ executado (asserts ok) |
| **Python** · Exercício 02 (inicial + solução) | ✅ executado (3 caminhos com asserts) |
| LangSmith / tracing gerenciado | ⚠️ não executado localmente: exige conta; substituído por `stream` + tabela de auditoria |
| Padrões Hierarchical, Group Chat e Consensus; CrewAI, AutoGPT, AutoGen, Agentarium, Claude agent teams | ⚠️ não executado localmente: conceitual no doc 04 (frameworks/produtos externos) |
| U8 · Projeto prático | fora do escopo deste repositório, a pedido |

Tempos: o modelo roda em CPU e é compartilhado; a mesma chamada levou de 4 s a 40+ min conforme a fila do
Ollama. Compare chamadas e tokens, não segundos.

## Fontes

- Anthropic · Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- Anthropic · Effective context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic · Multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
- LangGraph JS: https://docs.langchain.com/oss/javascript/langgraph/overview (npm: https://registry.npmjs.org/@langchain/langgraph/latest)
- LangChain JS v1 · Agents: https://docs.langchain.com/oss/javascript/langchain/agents
- LangChain/LangGraph Python: https://docs.langchain.com/oss/python/langchain/agents · https://docs.langchain.com/oss/python/langgraph/overview (PyPI: https://pypi.org/project/langgraph/)
- SDK MCP Python: https://github.com/modelcontextprotocol/python-sdk · pgvector Python: https://github.com/pgvector/pgvector-python
- OpenAI · Function calling: https://platform.openai.com/docs/guides/function-calling
- ReAct: https://arxiv.org/abs/2210.03629 · ReWOO: https://arxiv.org/abs/2305.18323 · Reflexion: https://arxiv.org/abs/2303.11366
- pgvector: https://github.com/pgvector/pgvector
- OWASP GenAI · Excessive Agency: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
