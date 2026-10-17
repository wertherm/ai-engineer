# Módulo 08 · Arquitetura de Sistemas com IA

Padrões, trade-offs e decisões para desenhar sistemas com IA: quando usar IA ou regra, single × multi-agent,
RAG, roteamento, cache, human-in-the-loop e arquitetura enterprise. Cada padrão é **medido** em JavaScript (Node) com um LLM local.

Estudado em 2026-10-16 com Node 24.11, `openai` **7.34.0**, `pg` **8.23.1**, `pgvector` **0.3.0**, Postgres 18 + pgvector 0.8.7
e os modelos locais `qwen3.5:4b` (chat) e `qwen3-embedding:0.6b` (embeddings) no Ollama. Schema do Postgres: `m08`.

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| **U1 · Fundamentos de arquitetura AI-first** | |
| Arquiteturas tradicionais × AI-driven | [doc 01](docs/01-fundamentos-ai-first.md#tradicional--ai-driven) (conceitual) |
| Cinco padrões de design (Prompting, Responsible AI, UX, AI-Ops, Optimization) | [doc 01](docs/01-fundamentos-ai-first.md#os-cinco-padrões-de-design-em-sistemas-inteligentes) (tabela com links para os exemplos) |
| Decision framework IA × regras determinísticas | [doc 01](docs/01-fundamentos-ai-first.md#decision-framework-ia-ou-regra-determinística) · [exemplo 01](exemplos/01-decision-framework/) |
| Trade-offs latência × precisão × custo × performance | [doc 01](docs/01-fundamentos-ai-first.md#trade-offs-latência--precisão--custo--performance) · [exemplo 01](exemplos/01-decision-framework/) · [exemplo 05](exemplos/05-roteador-e-cache-semantico/) |
| **U2 · Arquiteturas single-agent** | |
| Agentes em fluxos lineares | [doc 02](docs/02-single-agent-e-multi-agent.md#padrões-de-single-agent) · [exemplo 02](exemplos/02-single-agent-simulado/) |
| Padrões Reactive, Memory-Enhanced | [exemplo 02](exemplos/02-single-agent-simulado/) |
| Padrões Tool-Using, ReAct | [exercício 02](exercicios/02-agentic-rag/) · [módulo 04](../04-agentes-autonomos/README.md) |
| Padrão Self-Reflection | [doc 02](docs/02-single-agent-e-multi-agent.md#padrões-de-single-agent) (conceitual) · implementação no [módulo 04](../04-agentes-autonomos/README.md) |
| Contextos ideais (tarefas curtas, orçamento limitado, baixa latência) | [doc 02](docs/02-single-agent-e-multi-agent.md#padrões-de-single-agent) |
| Protótipos simples em JS com APIs de IA | [exemplo 02](exemplos/02-single-agent-simulado/) · [exercício 02](exercicios/02-agentic-rag/) |
| Simular interações agente × usuário | [exemplo 02](exemplos/02-single-agent-simulado/) (usuário com roteiro fixo) |
| **U3 · Arquiteturas multi-agent** | |
| Padrões Sequential, Parallel, Supervisor | [doc 02](docs/02-single-agent-e-multi-agent.md#padrões-multi-agent) · [exemplo 03](exemplos/03-multiagente-com-fila/) |
| Padrões Hierarchical, Group Chat, Handoff | [doc 02](docs/02-single-agent-e-multi-agent.md#padrões-multi-agent) (conceitual; Handoff como "Experimente" do exemplo 03) |
| Desafios distribuídos (falha de nó, coordenação, estado, sincronização) | [doc 02](docs/02-single-agent-e-multi-agent.md#desafios-de-sistema-distribuído) · [exemplo 03](exemplos/03-multiagente-com-fila/) (retry, timeout, DLQ, SKIP LOCKED) |
| Comunicação entre agentes em JS (filas, chamadas assíncronas) | [doc 02](docs/02-single-agent-e-multi-agent.md#comunicação-em-js-filas-e-chamadas-assíncronas) · [exemplo 03](exemplos/03-multiagente-com-fila/) (memória e Postgres LISTEN/NOTIFY) |
| Casos corporativos | [doc 02](docs/02-single-agent-e-multi-agent.md#casos-corporativos) |
| **U4 · Padrões de design específicos de IA** | |
| RAG Basic, Hybrid Search, Multi-Index | [doc 03](docs/03-padroes-de-design-de-ia.md#rag-basic-hybrid-multi-index-e-agentic) · [exemplo 04](exemplos/04-padroes-de-rag/) (recall@k medido) |
| Agentic RAG | [doc 03](docs/03-padroes-de-design-de-ia.md#rag-basic-hybrid-multi-index-e-agentic) · [exercício 02](exercicios/02-agentic-rag/) |
| Model Router, Intent-Based Routing | [doc 03](docs/03-padroes-de-design-de-ia.md#roteamento-inteligente) · [exemplo 05](exemplos/05-roteador-e-cache-semantico/) |
| Semantic Cache, Prompt Cache, Response Streaming | [doc 03](docs/03-padroes-de-design-de-ia.md#caching-semantic-cache-prompt-cache-e-streaming) · [exemplo 05](exemplos/05-roteador-e-cache-semantico/) (Prompt Cache: conceitual + campo `cached_tokens`) |
| HITL: Approval Gates, Confidence Thresholds, Audit Trails | [doc 03](docs/03-padroes-de-design-de-ia.md#human-in-the-loop) · [exemplo 06](exemplos/06-hitl-approval-gate/) |
| **U5 · Arquitetura enterprise** | |
| Arquiteturas de IA em produção (modularidade, escalabilidade, segurança) | [doc 04](docs/04-arquitetura-enterprise.md#o-stack-em-camadas) |
| Stack API Gateway → orquestração (Kubernetes) → serviços compartilhados → observabilidade | [doc 04](docs/04-arquitetura-enterprise.md#o-stack-em-camadas) (Mermaid) · [exemplo 07](exemplos/07-gateway-de-ia/) (camada gateway) |
| Loose Coupling, Clear Interfaces, Policy-Driven Control | [doc 04](docs/04-arquitetura-enterprise.md#três-princípios) · [exemplo 06](exemplos/06-hitl-approval-gate/) · [exemplo 07](exemplos/07-gateway-de-ia/) |
| Observabilidade de IA (prompts, logs, métricas) | [doc 04](docs/04-arquitetura-enterprise.md#observabilidade-de-ia) · [exemplo 07](exemplos/07-gateway-de-ia/) (traceparent, log JSON, `/metrics`) |
| Implantação híbrida (Kubernetes, Serverless, Edge) | [doc 04](docs/04-arquitetura-enterprise.md#implantação-híbrida-kubernetes-serverless-e-edge) (conceitual; YAML ilustrativo **não executado localmente**: o cluster real está na [trilha LLMOps](../../trilhas-extras/llmops-vllm-openshift/README.md)) |
| Simulação de roteamento de modelos e controle de custos (Model Tiering) | [doc 04](docs/04-arquitetura-enterprise.md#simulação-de-roteamento-e-controle-de-custos-model-tiering) · [exemplo 05](exemplos/05-roteador-e-cache-semantico/) · [exercício 01](exercicios/01-tier-e-orcamento/) |

## Pré-requisitos

- Infra do repositório no ar (Ollama + Postgres com pgvector), a partir da raiz: `bash infra/subir-ia.sh`.
- Node 22.19+ (estudado no 24.11) e, na pasta do módulo, `npm install`.
- Variáveis (opcionais; os defaults apontam para a infra local): veja `infra/.env.example`. Preços fictícios dos tiers via `PRECOS`.
- Sem chave de API: tudo roda local. Em CPU o `qwen3.5:4b` faz ~5 tokens/s; exemplos com LLM levam minutos.

## Como rodar

```bash
cd modulos/08-arquitetura-de-sistemas-com-ia
npm install
npm run ex01     # decision framework: regra × LLM × híbrido (8 chamadas ao LLM)
npm run ex02     # single-agent: Reactive × Memory-Enhanced com usuário simulado (6 chamadas)
npm run ex03     # multi-agente com fila, falha, retry, DLQ e Postgres LISTEN/NOTIFY (sem LLM)
npm run ex04     # RAG Basic × Hybrid (RRF) × Multi-Index com recall@k (só embeddings)
npm run ex05     # Model Router + Tiering + Semantic Cache + streaming (3 chamadas)
npm run ex06     # HITL: approval gate + audit trail com hash encadeado (sem LLM)
npm run ex07     # AI Gateway: tenant, rate limit, tiers, tracing, /metrics (2 chamadas; porta 30806)
npm run exe01    # exercício 01: tier médio + política de orçamento (simulação + testes, sem LLM)
npm run exe02    # exercício 02: Agentic RAG (5 chamadas)
npm test         # 11 testes rápidos (resiliência, gate, roteador), sem LLM
```

## Status de verificação

| Item | Status |
|---|---|
| Exemplo 01 · decision framework | ✅ executado (híbrido 100% de acerto pela metade do custo do LLM) |
| Exemplo 02 · single-agent simulado | ✅ executado (Reactive esquece, Memory-Enhanced lembra) |
| Exemplo 03 · multi-agente com fila | ✅ executado + 3 testes |
| Exemplo 04 · padrões de RAG | ✅ executado (recall@1: basic 9/10, hybrid 9/10, federado 9/10, roteado 8/10) |
| Exemplo 05 · roteador + cache | ✅ executado (economia de 68% contra "tudo no caro") |
| Exemplo 06 · HITL + audit trail | ✅ executado + 4 testes |
| Exemplo 07 · AI Gateway | ✅ executado (200/403/429/401 e `/metrics`) |
| Exercício 01 · tier e orçamento | ✅ executado + 4 testes |
| Exercício 02 · Agentic RAG | ✅ executado |
| YAML de Kubernetes do doc 04 | ⚠️ não executado localmente: ilustrativo; implantação real em cluster na trilha LLMOps |
| Prompt Cache | ⚠️ conceitual: o Ollama local devolveu `cached_tokens: 0`; o comportamento depende do provedor |

## Fontes

- OpenAI Node SDK: https://github.com/openai/openai-node · Chat Completions: https://platform.openai.com/docs/api-reference/chat
- Ollama · compatibilidade OpenAI: https://docs.ollama.com/api/openai-compatibility
- pgvector: https://github.com/pgvector/pgvector · node-postgres: https://node-postgres.com/
- PostgreSQL 18 · Full Text Search e NOTIFY: https://www.postgresql.org/docs/18/textsearch.html · https://www.postgresql.org/docs/18/sql-notify.html
- Anthropic · Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- Microsoft · AI agent orchestration patterns: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns
- OpenTelemetry · GenAI semantic conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/
- AWS · Well-Architected Generative AI Lens: https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/generative-ai-lens.html
