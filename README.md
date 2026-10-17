# AI Engineer

Repositório de estudo de **engenharia de IA aplicada**: os módulos da pós *Engenharia de IA Aplicada*
(com docs, exemplos executáveis e exercícios com solução) e duas trilhas extras de produção (**LLMOps** com
vLLM/OpenShift e **MLOps** com MLflow/Kubeflow). Tudo roda numa máquina Linux **sem GPU**, com um LLM local
(Ollama), e troca para OpenAI/OpenRouter mudando só variáveis de ambiente.

## Como está organizado

```
ai-engineer/
├── README.md            ← você está aqui
├── ementa/              PDF da ementa + mapa.md (cada módulo e cada tecnologia → onde está no repo)
├── modulos/             um módulo da pós por pasta: README (mapa da ementa) · docs/ · exemplos/ · exercicios/
├── trilhas-extras/      llmops-vllm-openshift/ · mlops/
├── referencia/          cheatsheet · glossário · armadilhas · boas práticas · referências · o que dá para fazer
└── infra/               Ollama + Postgres/pgvector (compose) · vLLM · guia de instalação
```

**Procurando algo?** Comece pelo [mapa da ementa](ementa/mapa.md) (tópico ou tecnologia → pasta) ou pela
[referência](referencia/): [cheatsheet](referencia/cheatsheet.md), [glossário](referencia/glossario.md),
[armadilhas reais](referencia/armadilhas-comuns.md), [boas práticas](referencia/boas-praticas.md),
[referências oficiais](referencia/referencias.md) e [o que dá para fazer](referencia/o-que-da-para-fazer.md).

## Trilha

### Módulos da pós

| # | Módulo | Destaques práticos |
|---|---|---|
| 01 | [Fundamentos de IA e LLMs](modulos/01-fundamentos-ia-llms/) | tensores e rede neural em TensorFlow.js, detecção de objetos em vídeo no browser, primeiro RAG com pgvector |
| 02 | [APIs de IA Generativa e Prompt Engineering](modulos/02-apis-ia-generativa/) | chaining e structured outputs, custo e cache, RAG com LangChain.js, API back-end testada, OCR, visão e Whisper locais |
| 03 | [MCP – Model Context Protocol](modulos/03-mcp/) | servidor e client em TS, "empresa como MCP", ponte MCP → LLM, HTTP com token e rate limit, Inspector |
| 04 | [Criação de Agentes Autônomos](modulos/04-agentes-autonomos/) | agent loop do zero, ReAct × Plan-and-Execute, reflection e memória, contexto, LangGraph com HITL, multiagente |
| 05 | [Ferramentas de IA para UX & UI](modulos/05-ia-ux-ui/) | Text-to-UI com checagem de acessibilidade, ideia → componente testado, app com MCP e testes E2E por agente |
| 06 | [Ferramentas de IA para DevOps](modulos/06-ia-devops/) | IaC copilot com OpenTofu (Terraform) + OPA, deploy e troubleshooting no Kubernetes, AIOps, ChatOps com aprovação, Trivy |
| 07 | [Ferramentas de IA para Gestão de Projetos](modulos/07-ia-gestao-de-projetos/) | requirements copilot, RICE/WSJF, Monte Carlo, ata → status report, bot de cards com aprovação |
| 08 | [Arquitetura de Sistemas com IA](modulos/08-arquitetura-de-sistemas-com-ia/) | regra × LLM, multiagente com fila, padrões de RAG, roteador + cache semântico, approval gate, gateway |
| 09 | [Dados e Fine-Tuning](modulos/09-dados-e-fine-tuning/) | dataset JSONL, fine-tuning via API, **LoRA real em CPU**, avaliação A/B |
| 10 | [Segurança e Governança](modulos/10-seguranca-e-governanca/) | explicabilidade, vieses, prompt injection, PII, custos, model card |
| 11 | [Capstone: Micro-SaaS](modulos/11-capstone-micro-saas/) | RAG multi-tenant com citações, API + OpenAPI, MCP, UI Angular, Google ADK, CI e compose |
| 12 | [Carreira e Entrevistas](modulos/12-carreira/) | auditoria de portfólio, STAR e brag document, simulador de entrevista, system design de IA com custo |

Ordem sugerida: 01 → 02 → 03 → 04 → 08 → 09 → 10 → 11, com 05, 06, 07 e 12 conforme o interesse. Tópicos da
ementa deixados de fora a pedido estão listados no [mapa](ementa/mapa.md#fora-do-escopo-deste-repositório-a-pedido).

### Trilhas extras

| Trilha | O que ensina |
|---|---|
| [LLMOps com vLLM e OpenShift](trilhas-extras/llmops-vllm-openshift/) | servir LLM com vLLM em CPU, TTFT/ITL, métricas Prometheus, avaliação, custo por token, Kubernetes/OpenShift, portão de promoção |
| [MLOps com MLflow e Kubeflow](trilhas-extras/mlops/) | tracking, registry com champion/challenger, serving, drift (KS + PSI), pipeline com portão e Kubeflow |

## Versão estudada

Verificado entre 2026-10-13 e 2026-10-17, numa CPU de 8 núcleos com 15 GB de RAM e sem GPU:

- **LLM local:** Ollama 0.40.5 com `qwen3.5:4b` (chat, tools e visão) e `qwen3-embedding:0.6b` · Postgres 18 + pgvector 0.8.7.
- **JS/TS:** Node 24 · openai 7.34 · @modelcontextprotocol/sdk 1.32.1 · LangChain.js 1.x / LangGraph.js 1.5 · TensorFlow.js 4.22 · @google/adk 2.3 · Angular 22.
- **Python:** 3.14 + uv · scikit-learn 1.9 · MLflow 3.17 · PyTorch 2.14 (CPU) + PEFT 0.21.
- **Plataforma:** vLLM 0.31 · kind 0.33 · kubectl 1.37 · OpenShift 4.22 / OpenShift AI 3.5 (documentação).

As versões exatas de cada módulo estão no `package.json` / `pyproject.toml` dele.

## Como rodar

```bash
bash infra/subir-ia.sh                     # Ollama + Postgres/pgvector (1ª vez: ~3 min e ~4 GB de modelos)
cd modulos/01-fundamentos-ia-llms
npm install
npm run ex01                               # cada módulo lista os seus comandos no README
```

- **Python** (trilhas extras e partes dos módulos 06, 09 e 10): `uv sync` na raiz; o módulo 09 tem `pyproject.toml` próprio.
- **Trocar para a OpenAI ou o OpenRouter:** `OPENAI_BASE_URL`, `OPENAI_API_KEY` e `MODELO_CHAT` (veja [infra/.env.example](infra/.env.example)).
- **Desligar tudo:** `bash infra/parar-ia.sh` (modelos e dados ficam nos volumes).

Instalação completa: [infra/instalacao.md](infra/instalacao.md).

## Status de verificação

| Parte | Status |
|---|---|
| Módulos 01–12 | ✅ exemplos e soluções executados contra o LLM local; saídas reais nos READMEs. Cada módulo tem uma tabela de status própria |
| Trilhas extras | ✅ executadas (vLLM em CPU, kind, MLflow, Kubeflow local) |
| Plataformas com conta, chave ou login (OpenAI, Gemini, OpenRouter, Firebase, Gemini CLI, Jira/Slack/Notion, Infracost, OpenShift real, deploy de CI) | ⚠️ código e passo a passo prontos; **não executados localmente**, sempre marcado no módulo |

Os tempos de resposta nos READMEs vêm de um LLM em CPU, muitas vezes disputado por vários processos: compare
chamadas e tokens, não segundos. O modelo local de 4B erra mais que um modelo de fronteira, e várias lições do
repo vêm justamente disso (validação com schema, regras em código, portões de avaliação).

## Referências

Fontes oficiais de cada tema: [referencia/referencias.md](referencia/referencias.md).
