# AI Engineer

Repositório de estudo de **engenharia de IA aplicada**: os módulos da pós *Engenharia de IA Aplicada*
(com docs, exemplos executáveis e exercícios com solução, **em JavaScript/TypeScript e em Python**) e duas trilhas extras de produção (**LLMOps** com
vLLM/OpenShift e **MLOps** com MLflow/Kubeflow). Tudo roda numa máquina Linux **sem GPU**, com um LLM local
(Ollama), e troca para OpenAI/OpenRouter mudando só variáveis de ambiente.

## Como está organizado

```
ai-engineer/
├── README.md            ← você está aqui
├── AI_CONTEXT.md        regras para o assistente de IA que ensina com a Academia
├── academia/            trilha guiada de 16 etapas, projeto evolutivo e acompanhamento dos alunos
├── ementa/              PDF da ementa + mapa.md (cada módulo e cada tecnologia → onde está no repo)
├── modulos/             um módulo da pós por pasta: README (mapa da ementa) · docs/ · exemplos/ · exercicios/
├── trilhas-extras/      llmops-vllm-openshift/ · mlops/
├── referencia/          cheatsheet · glossário · armadilhas · boas práticas · referências · o que dá para fazer
└── infra/               Ollama + Postgres/pgvector (compose) · vLLM · guia de instalação
```

**Quer estudar com acompanhamento (lições, XP, progresso)?** Comece pelo [Guia rápido da Academia](academia/GUIA-RAPIDO.md).

**Procurando algo?** Comece pelo [mapa da ementa](ementa/mapa.md) (tópico ou tecnologia → pasta) ou pela
[referência](referencia/): [cheatsheet](referencia/cheatsheet.md), [glossário](referencia/glossario.md),
[armadilhas reais](referencia/armadilhas-comuns.md), [boas práticas](referencia/boas-praticas.md),
[referências oficiais](referencia/referencias.md) e [o que dá para fazer](referencia/o-que-da-para-fazer.md).

## Academia: trilha guiada com acompanhamento

A [Academia de Engenharia de IA](academia/README.md) organiza os módulos abaixo em **16 etapas progressivas**, com
lições que ensinam e avaliam (quiz com correção comentada, laboratório com critérios objetivos, rubrica), um projeto
único que evolui a cada etapa e acompanhamento individual com XP, níveis, conquistas e checkpoints, em arquivos
versionados que qualquer assistente de IA consegue retomar. Os módulos continuam sendo o material de estudo.
Comece pela [Missão 0](academia/licoes/00-missao-0-diagnostico/README.md) e veja o [roadmap](academia/ROADMAP.md).

### Como interagir com o conteúdo (passo a passo)

Pré-requisitos: **Node 22.19 ou superior** para a Academia e as extensões (o repositório usa o 24 e alguns módulos o exigem), Git e, para rodar um LLM local, Docker (Ollama + Postgres/pgvector). Python com `uv` só nas trilhas extras e em partes dos módulos 06, 09 e 10. Os comandos abaixo são de **bash**; no PowerShell, defina variáveis com `$env:NOME="valor"`. Sem Docker, aponte para qualquer endpoint compatível com a API de chat: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODELO_CHAT`.

```bash
git clone https://github.com/wertherm/ai-engineer.git && cd ai-engineer
node academia/ferramentas/academia.mjs validar        # confere que está tudo consistente na sua máquina
```

| Quero... | Faça isto |
|---|---|
| **Estudar e rodar os exemplos dos módulos** | veja [Como rodar](#como-rodar): `bash infra/subir-ia.sh`, depois `npm run exNN` dentro de cada módulo. Cada módulo tem um README com mapa, comandos e status de verificação |
| **Seguir a trilha guiada com um assistente de IA** (ChatGPT, Claude, Codex, Cursor...) | 1) faça a [Missão 0](academia/licoes/00-missao-0-diagnostico/README.md); 2) gere o texto da conversa: `node academia/ferramentas/academia.mjs kit <seu-aluno> > kit.txt` e cole numa conversa nova; 3) estude a lição com o assistente (um agente que enxerga o repositório pode ler os arquivos direto, mas precisa ser instruído a ler `AGENTS.md`/`AI_CONTEXT.md`); 4) no fim, peça o relatório da sessão e registre: `sessao <aluno>` (cria o arquivo; cole o relatório nele), `progresso <aluno>` (recusa gravar se houver erro e diz qual) e `validar --aluno <aluno>`. Detalhes: [SINCRONIZACAO](academia/SINCRONIZACAO.md) |
| **Retomar depois de uma pausa** ou trocar de assistente | abra `academia/alunos/<aluno>/retomada.md` ou gere o `kit` de novo: nada depende do histórico de uma conversa |
| **Usar o time de agentes no meu dia a dia** | [extensão Time de agentes](academia/extensoes/time-de-agentes/README.md): `cd academia/extensoes/time-de-agentes`, copie a configuração, defina o endpoint do modelo e delegue uma tarefa com `node referencia/cli.mjs`. Para revisar uma mudança sua, passe o diff com `--entrada` e a pasta do projeto com `--raiz`. **Atenção:** ainda não foi executado contra um LLM real (veja o aviso da extensão). Projetos para começar: [projetos práticos](academia/extensoes/time-de-agentes/projetos-praticos.md) |
| **Aprofundar** (memória por MCP, harness, engenharia reversa, RAG avançado) | [extensões da Academia](academia/extensoes/README.md) |
| **Contribuir ou conferir** | `node --test "academia/**/*.test.mjs"` e `node academia/ferramentas/academia.mjs validar`; abra um pull request (não faça commit direto na branch padrão) |

Alunos cadastrados: `werther` e `responsavel` (um espaço reservado). Para ter a sua pasta com o seu nome, crie-a com `node academia/ferramentas/academia.mjs novo-aluno <slug> "Nome"` e apague `academia/alunos/responsavel` se não for usar.

> **Status:** a Academia, a Lição 1 e as extensões são testadas com funções e servidores **simulados**; **nenhum laboratório foi executado contra um LLM real ainda**. A primeira execução real deve registrar o modelo e os ajustes (cada documento diz isso no seu aviso).

O mapa completo do que a Academia oferece está no [README da Academia](academia/README.md#o-que-está-implementado).

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
- **Python:** 3.14 + uv · openai 3.3x · mcp 2.3 · LangChain/LangGraph · FastAPI · psycopg 3 · google-adk 2.12 · scikit-learn 1.9 · MLflow 3.17 · PyTorch 2.14 (CPU) + PEFT 0.21.
- **Plataforma:** vLLM 0.31 · kind 0.33 · kubectl 1.37 · OpenShift 4.22 / OpenShift AI 3.5 (documentação).

As versões exatas de cada módulo estão no `package.json` / `pyproject.toml` dele.

## Como rodar

```bash
bash infra/subir-ia.sh                     # Ollama + Postgres/pgvector (1ª vez: ~3 min e ~4 GB de modelos)
cd modulos/01-fundamentos-ia-llms
npm install && npm run ex01                # versão JavaScript/TypeScript
uv sync && uv run python exemplos/01-tensores/python/main.py   # versão Python do mesmo exemplo
```

Cada exemplo e cada solução de exercício tem as duas versões: o JS na pasta do exemplo e o Python na subpasta
`python/`, com a saída real das duas no README. Cada módulo tem `package.json` e `pyproject.toml` próprios.
O que roda dentro do navegador (HTML e a UI Angular do Capstone) fica só em JS; no Capstone, a mesma UI Angular
foi testada contra a API JS e contra a API Python.

- **Python:** `uv sync` na pasta de cada módulo; as trilhas extras usam o `pyproject.toml` da raiz.
- **Trocar para a OpenAI ou o OpenRouter:** `OPENAI_BASE_URL`, `OPENAI_API_KEY` e `MODELO_CHAT` (veja [infra/.env.example](infra/.env.example)).
- **Desligar tudo:** `bash infra/parar-ia.sh` (modelos e dados ficam nos volumes).

Instalação completa: [infra/instalacao.md](infra/instalacao.md).

## Status de verificação

| Parte | Status |
|---|---|
| Módulos 01–12 | ✅ exemplos e soluções executados contra o LLM local, **em JS e em Python**; saídas reais nos READMEs. Cada módulo tem uma tabela de status própria |
| Trilhas extras | ✅ executadas (vLLM em CPU, kind, MLflow, Kubeflow local) |
| Academia (lições, ferramenta, extensões) | ✅ validador e testes automatizados com simulações · ⚠️ **não executados contra um LLM real** |
| Plataformas com conta, chave ou login (OpenAI, Gemini, OpenRouter, Firebase, Gemini CLI, Jira/Slack/Notion, Infracost, OpenShift real, deploy de CI) | ⚠️ código e passo a passo prontos; **não executados localmente**, sempre marcado no módulo |

Os tempos de resposta nos READMEs vêm de um LLM em CPU, muitas vezes disputado por vários processos: compare
chamadas e tokens, não segundos. O modelo local de 4B erra mais que um modelo de fronteira, e várias lições do
repo vêm justamente disso (validação com schema, regras em código, portões de avaliação).

## Referências

Fontes oficiais de cada tema: [referencia/referencias.md](referencia/referencias.md).
