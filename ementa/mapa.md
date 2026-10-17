# Mapa da ementa → repositório

Onde está cada parte da pós **Engenharia de IA Aplicada** ([PDF da ementa](Ementa_Detalhada__Engenheria_de_IA_Aplicada_1763558262665605.pdf))
neste repositório. Cada módulo tem, no próprio README, um **Mapa da ementa** com cada tópico apontando para o
doc, o exemplo ou o exercício que o cobre.

## Módulos

| # | Módulo da ementa | Pasta | Mapa detalhado |
|---|---|---|---|
| 1 | Fundamentos de IA e LLMs para Programadores | [01-fundamentos-ia-llms](../modulos/01-fundamentos-ia-llms/) | [mapa](../modulos/01-fundamentos-ia-llms/README.md#mapa-da-ementa) |
| 2 | APIs de IA Generativa e Prompt Engineering | [02-apis-ia-generativa](../modulos/02-apis-ia-generativa/) | [mapa](../modulos/02-apis-ia-generativa/README.md#mapa-da-ementa) |
| 3 | MCP – Model Context Protocol | [03-mcp](../modulos/03-mcp/) | [mapa](../modulos/03-mcp/README.md#mapa-da-ementa) |
| 4 | Criação de Agentes Autônomos | [04-agentes-autonomos](../modulos/04-agentes-autonomos/) | [mapa](../modulos/04-agentes-autonomos/README.md#mapa-da-ementa) |
| 5 | Ferramentas de IA para UX & UI | [05-ia-ux-ui](../modulos/05-ia-ux-ui/) | [mapa](../modulos/05-ia-ux-ui/README.md#mapa-da-ementa) |
| 6 | Ferramentas de IA para DevOps | [06-ia-devops](../modulos/06-ia-devops/) | [mapa](../modulos/06-ia-devops/README.md#mapa-da-ementa) |
| 7 | Ferramentas de IA para Gestão de Projetos | [07-ia-gestao-de-projetos](../modulos/07-ia-gestao-de-projetos/) | [mapa](../modulos/07-ia-gestao-de-projetos/README.md#mapa-da-ementa) |
| 8 | Arquitetura de Sistemas com IA | [08-arquitetura-de-sistemas-com-ia](../modulos/08-arquitetura-de-sistemas-com-ia/) | [mapa](../modulos/08-arquitetura-de-sistemas-com-ia/README.md#mapa-da-ementa) |
| 9 | Processamento de Dados e Fine-Tuning de Modelos | [09-dados-e-fine-tuning](../modulos/09-dados-e-fine-tuning/) | [mapa](../modulos/09-dados-e-fine-tuning/README.md#mapa-da-ementa) |
| 10 | Segurança e Governança em IA | [10-seguranca-e-governanca](../modulos/10-seguranca-e-governanca/) | [mapa](../modulos/10-seguranca-e-governanca/README.md#mapa-da-ementa) |
| 11 | Projeto Integrador – Capstone (Micro-SaaS) | [11-capstone-micro-saas](../modulos/11-capstone-micro-saas/) | [mapa](../modulos/11-capstone-micro-saas/README.md#mapa-da-ementa) |
| 12 | Carreira e Entrevistas para Engenheiros de AI Aplicada | [12-carreira](../modulos/12-carreira/) | [mapa](../modulos/12-carreira/README.md#mapa-da-ementa) |

Fora da ementa, mas complementares: [trilha de LLMOps com vLLM e OpenShift](../trilhas-extras/llmops-vllm-openshift/)
(serving, latência, custo por token, Kubernetes/OpenShift) e [trilha de MLOps](../trilhas-extras/mlops/)
(MLflow, drift, pipelines Kubeflow).

## Índice por tecnologia e plataforma

As tecnologias e plataformas citadas na ementa, e onde praticá-las. ⚠️ = depende de conta, chave ou
plataforma externa: o código e o passo a passo estão no repo, mas não foram executados localmente.

| Tecnologia / plataforma | Onde |
|---|---|
| TensorFlow.js (tensores, redes neurais) | [01 · exemplos 01–02](../modulos/01-fundamentos-ia-llms/exemplos/) |
| ML no browser com vídeo (MediaPipe) | [01 · exemplo 03](../modulos/01-fundamentos-ia-llms/exemplos/03-visao-no-browser/) |
| Ollama (modelos locais) | [infra](../infra/instalacao.md) · [01 · exemplo 06](../modulos/01-fundamentos-ia-llms/exemplos/06-openrouter-e-ollama/) · usado em todos os módulos |
| OpenRouter ⚠️ | [01 · exemplo 06](../modulos/01-fundamentos-ia-llms/exemplos/06-openrouter-e-ollama/) (catálogo público executado; chamadas exigem chave) |
| Embeddings, RAG e Postgres/pgvector | [01 · exemplo 05](../modulos/01-fundamentos-ia-llms/exemplos/05-primeiro-rag/) · [08 · exemplo 04](../modulos/08-arquitetura-de-sistemas-com-ia/exemplos/04-padroes-de-rag/) · [11](../modulos/11-capstone-micro-saas/) |
| Prompt engineering, chaining e templates | [01 · exemplo 04](../modulos/01-fundamentos-ia-llms/exemplos/04-prompt-engineering/) · [02 · exemplo 01](../modulos/02-apis-ia-generativa/exemplos/01-prompt-chaining-e-templates/) |
| Structured outputs, custo e cache | [02 · exemplos 01–02](../modulos/02-apis-ia-generativa/exemplos/) · [08 · exemplo 05](../modulos/08-arquitetura-de-sistemas-com-ia/exemplos/05-roteador-e-cache-semantico/) |
| LangChain.js | [02 · exemplo 03](../modulos/02-apis-ia-generativa/exemplos/03-rag-langchain-observabilidade/) · [04 · exemplo 02](../modulos/04-agentes-autonomos/exemplos/02-react-vs-plan-execute/) |
| LangGraph.js | [04 · exemplo 06](../modulos/04-agentes-autonomos/exemplos/06-langgraph-hitl-guardrails/) · [04 · exercício 02](../modulos/04-agentes-autonomos/exercicios/02-linear-para-langgraph/) |
| OpenAI API / Vision / Whisper ⚠️ | código compatível em todos os módulos (troque `OPENAI_BASE_URL`); Whisper e visão locais no [02 · exemplos 05–06](../modulos/02-apis-ia-generativa/exemplos/) |
| Gemini multimodal ⚠️ | [02 · doc 04](../modulos/02-apis-ia-generativa/docs/04-multimodal-e-aplicacoes.md) |
| OCR (tesseract.js) e bots multimodais | [02 · exemplos 05–06](../modulos/02-apis-ia-generativa/exemplos/) |
| Back-end com LLM (auth, versionamento, testes) | [02 · exemplo 04](../modulos/02-apis-ia-generativa/exemplos/04-api-backend-com-llm/) · [11](../modulos/11-capstone-micro-saas/) |
| MCP (SDK TypeScript, Inspector, segurança) | [03](../modulos/03-mcp/) · [05 · exemplo 03](../modulos/05-ia-ux-ui/exemplos/03-app-com-mcp-e2e/) · [11](../modulos/11-capstone-micro-saas/) |
| n8n MCP, Playwright MCP, Context7 ⚠️ | [01 · doc 04](../modulos/01-fundamentos-ia-llms/docs/04-rag-mcp-e-modelos.md) |
| Agentes: ReAct, Plan-and-Execute, Reflection, memória, multiagente | [04](../modulos/04-agentes-autonomos/) · [08 · exemplos 02–03](../modulos/08-arquitetura-de-sistemas-com-ia/exemplos/) |
| CrewAI, AutoGen, AutoGPT ⚠️ | [04 · doc 04](../modulos/04-agentes-autonomos/docs/04-sistemas-multiagente.md) (conceitual) |
| Google ADK (Agent Development Kit) | [11 · exemplo 04](../modulos/11-capstone-micro-saas/exemplos/04-orquestracao-adk/) (com Ollama via adaptador próprio) |
| Text-to-UI e acessibilidade (axe-core) | [05 · exemplo 01](../modulos/05-ia-ux-ui/exemplos/01-text-to-ui-acessivel/) |
| MCP-UI (mcpui.dev) | [05 · exemplo 03](../modulos/05-ia-ux-ui/exemplos/03-app-com-mcp-e2e/) |
| Gemini CLI ⚠️ | [05 · doc 02](../modulos/05-ia-ux-ui/docs/02-agentes-e-cli-no-front-end.md) |
| Firebase Studio e Firebase AI Logic ⚠️ | [05 · docs 01 e 04](../modulos/05-ia-ux-ui/docs/) |
| Angular | [11 · exemplo 03](../modulos/11-capstone-micro-saas/exemplos/03-entrega-3-front-e-implantacao/) |
| Terraform/OpenTofu e OPA/conftest (IaC copilot) | [06 · exemplo 01](../modulos/06-ia-devops/exemplos/01-iac-copilot-terraform/) · [06 · exercício 01](../modulos/06-ia-devops/exercicios/01-politica-opa-nova/) |
| Kubernetes (kind): deploy, HPA, troubleshooting | [06 · exemplos 02–03](../modulos/06-ia-devops/exemplos/) · [trilha LLMOps · exemplo 07](../trilhas-extras/llmops-vllm-openshift/exemplos/07-vllm-no-kubernetes/) |
| AIOps: Isolation Forest, PromQL | [06 · exemplo 04](../modulos/06-ia-devops/exemplos/04-aiops-anomalias-e-promql/) |
| ChatOps com aprovação humana | [06 · exemplo 05](../modulos/06-ia-devops/exemplos/05-chatops-com-aprovacao/) |
| Trivy (scan e "AI fix") | [06 · exemplo 06](../modulos/06-ia-devops/exemplos/06-seguranca-scan-e-ai-fix/) |
| Argo CD, Flux, Infracost, Slack/Teams ⚠️ | [06 · docs](../modulos/06-ia-devops/docs/) |
| CI/CD (GitHub Actions) | [11 · exemplo 03](../modulos/11-capstone-micro-saas/exemplos/03-entrega-3-front-e-implantacao/) (CI local executado; deploy real não) |
| RICE, WSJF, Monte Carlo, atas, status reports | [07](../modulos/07-ia-gestao-de-projetos/) |
| Jira, Trello, Asana, Notion, Slack ⚠️ | [07 · exemplo 05](../modulos/07-ia-gestao-de-projetos/exemplos/05-bot-cards-aprovacao/) (mock local executado; APIs reais não) |
| Padrões de arquitetura (router, tiering, cache semântico, HITL, gateway) | [08](../modulos/08-arquitetura-de-sistemas-com-ia/) |
| Datasets JSONL, fine-tuning OpenAI ⚠️, LoRA/PEFT | [09](../modulos/09-dados-e-fine-tuning/) (LoRA real em CPU; OpenAI só com mock) |
| Explicabilidade, vieses, OWASP LLM, PII, custos | [10](../modulos/10-seguranca-e-governanca/) |
| Portfólio, entrevistas, system design de IA | [12](../modulos/12-carreira/) |

## Fora do escopo deste repositório (a pedido)

Estes tópicos da ementa ficaram de fora por escolha do estudante e aparecem assim nos mapas dos módulos:

- Módulo 1: **Aplicar ML em jogos**; **Ferramentas de IA para acelerar sua vida como Dev** (Cursor, Windsurf, `.cursor rules`, vibe coding); **Agents e automação avançada**.
- Módulo 2: **Panorama do mercado de IA como serviço**; **Principais provedores de modelos de IA** (OpenAI, Anthropic, Hugging Face, Gemini).
- Módulo 4: **Unidade 8 — Projeto Prático: Agent que Automatiza Tarefas Complexas**.
