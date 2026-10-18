# O que dá para fazer com este repositório

Visão prática do que já roda **localmente, sem GPU**. Os comandos das trilhas extras partem da raiz do repo;
os dos módulos, da pasta de cada módulo. Tudo foi executado de verdade (2026-10-13 a 2026-10-17).

## 🎓 Módulos da pós (LLM local via Ollama)

Antes: `bash infra/subir-ia.sh` (Ollama + Postgres/pgvector). Em cada módulo: `cd modulos/<pasta> && npm install`
(JavaScript) ou `uv sync` (Python, subpastas `python/`), depois os comandos listados no README do módulo.

| Módulo | O que dá para fazer |
|---|---|
| [01 · Fundamentos](../modulos/01-fundamentos-ia-llms/) | treinar a primeira rede neural em JS, detectar objetos num vídeo no browser, montar o primeiro RAG com Postgres |
| [02 · APIs de IA Generativa](../modulos/02-apis-ia-generativa/) | encadear prompts com saída validada, medir custo e cache, extrair dados de notas fiscais por OCR/visão, transcrever áudio, integrar LLM numa API testada |
| [03 · MCP](../modulos/03-mcp/) | criar um servidor MCP, expor um CRM como MCP, deixar o LLM chamar as tools, publicar por HTTP com token e rate limit |
| [04 · Agentes](../modulos/04-agentes-autonomos/) | agente do zero com tools, comparar ReAct e Plan-and-Execute, memória com embeddings, grafo LangGraph com aprovação humana, multiagente |
| [05 · UX & UI](../modulos/05-ia-ux-ui/) | gerar UI a partir de texto e checar acessibilidade, testar uma app por um agente via MCP + Playwright, proteger a chave do modelo no servidor |
| [06 · DevOps](../modulos/06-ia-devops/) | gerar Terraform validado por OPA, fazer deploy e diagnosticar pods quebrados no kind, detectar anomalias, ChatOps com aprovação, scan com Trivy |
| [07 · Gestão de Projetos](../modulos/07-ia-gestao-de-projetos/) | transformar texto em histórias com critérios, priorizar com RICE/WSJF, prever prazo com Monte Carlo, gerar ata e status report |
| [08 · Arquitetura](../modulos/08-arquitetura-de-sistemas-com-ia/) | decidir regra × LLM com números, multiagente com fila, comparar padrões de RAG, roteador com cache semântico, approval gate |
| [09 · Fine-Tuning](../modulos/09-dados-e-fine-tuning/) | preparar dataset JSONL, treinar um LoRA em CPU e comparar base × ajustado |
| [10 · Segurança](../modulos/10-seguranca-e-governanca/) | explicar previsões, medir vieses, atacar e defender um prompt, mascarar PII, projetar custos |
| [11 · Capstone](../modulos/11-capstone-micro-saas/) | rodar um Micro-SaaS completo: RAG com citações, API, MCP, UI Angular, agente via ADK e CI local |
| [12 · Carreira](../modulos/12-carreira/) | auditar o README de um portfólio, simular entrevista, estimar capacidade e custo num system design |

## 🧠 MLOps: o ciclo de vida de um modelo clássico

O modelo é um classificador de câncer de mama com scikit-learn + MLflow. Esta trilha **não precisa do vLLM**.

| O que dá para fazer | Comando |
|---|---|
| Treinar e comparar experimentos: cada treino guarda parâmetros, métricas, versão dos dados e o modelo | `uv run python trilhas-extras/mlops/exemplos/01-experimentos-com-mlflow/treinar.py` |
| Abrir a interface do MLflow e comparar os treinos lado a lado | `uv run mlflow server --backend-store-uri sqlite:///mlflow.db` → http://localhost:5000 |
| Registrar o melhor modelo e promovê-lo a "champion" só se ele for melhor que o atual | `uv run python trilhas-extras/mlops/exemplos/02-registro-e-promocao/promover.py` |
| Servir o champion como API REST e chamá-la | `bash trilhas-extras/mlops/exemplos/03-servindo-o-modelo/servir.sh` + `uv run python trilhas-extras/mlops/exemplos/03-servindo-o-modelo/chamar.py` |
| Detectar quando os dados de produção mudam em relação aos de treino (drift) | `uv run python trilhas-extras/mlops/exemplos/04-drift-e-monitoramento/drift.py` |
| Rodar um pipeline com validação de dados e um portão que barra versões ruins | `uv run python trilhas-extras/mlops/exemplos/05-pipeline-de-treino/pipeline.py` |
| Compilar e executar o mesmo pipeline em Kubeflow, no formato do OpenShift AI | `uv run --group kfp python trilhas-extras/mlops/exemplos/05-pipeline-de-treino/rodar_kfp_local.py` |

## 🤖 LLMOps: servir e operar um LLM

Antes, suba o servidor: `bash infra/subir-vllm.sh` (cerca de 4 min; usa ~6 GB de RAM).
Para liberar a memória depois: `bash infra/parar-vllm.sh`.

| O que dá para fazer | Onde |
|---|---|
| Conversar com um LLM próprio pela API no formato da OpenAI (curl ou SDK) | [exemplo 01](../trilhas-extras/llmops-vllm-openshift/exemplos/01-primeira-chamada/) |
| Ver como o texto vira tokens e como `temperature` e `seed` mudam a resposta | [exemplo 02](../trilhas-extras/llmops-vllm-openshift/exemplos/02-tokens-e-sampling/) |
| Medir as latências que o usuário sente (tempo até o 1º token e entre tokens) e ver o cache de prompt funcionando | [exemplo 03](../trilhas-extras/llmops-vllm-openshift/exemplos/03-streaming-ttft-itl/) |
| Ler as métricas Prometheus do servidor | [exemplo 04](../trilhas-extras/llmops-vllm-openshift/exemplos/04-metricas-prometheus/) |
| Avaliar o modelo como teste de regressão com pytest | [exemplo 05](../trilhas-extras/llmops-vllm-openshift/exemplos/05-avaliacao-com-pytest/) |
| Fazer teste de carga e calcular o custo por 1 milhão de tokens | [exemplo 06](../trilhas-extras/llmops-vllm-openshift/exemplos/06-carga-e-custo/) |
| Rodar o portão de promoção com Prometheus: aprova ou barra uma versão | [projeto-final](../trilhas-extras/llmops-vllm-openshift/projeto-final/) |

## ☸️ Plataforma: Kubernetes e OpenShift

- **vLLM no Kubernetes:** sobe num cluster kind local, com Deployment, Service e probes ([exemplo 07](../trilhas-extras/llmops-vllm-openshift/exemplos/07-vllm-no-kubernetes/), pasta `k8s/`).
- **Regras de segurança do OpenShift:** dá para simular no kind (container sem root, com usuário aleatório) com `bash trilhas-extras/llmops-vllm-openshift/exemplos/07-vllm-no-kubernetes/openshift/simular-no-kind.sh`.
- **Imagem sem root:** o [exercício 03](../trilhas-extras/llmops-vllm-openshift/exercicios/03-imagem-sem-root/) transforma um nginx que quebra no OpenShift em um que roda.
- **Cluster pausado:** para retomar, `docker start estudo-control-plane`; para criar do zero, `bash trilhas-extras/llmops-vllm-openshift/exemplos/07-vllm-no-kubernetes/criar-cluster.sh`.

## 🏋️ Exercícios das trilhas extras (5, com solução verificada)

Cada módulo da pós tem mais 2 exercícios com solução, listados no README do módulo.


1. [Classificador de sentimento](../trilhas-extras/llmops-vllm-openshift/exercicios/01-classificador-de-sentimento/), iterando o prompt e medindo cada versão.
2. [Alerta de SLO de latência](../trilhas-extras/llmops-vllm-openshift/exercicios/02-alerta-de-slo/), pronto para CI ou cron.
3. [Imagem sem root](../trilhas-extras/llmops-vllm-openshift/exercicios/03-imagem-sem-root/) para o OpenShift.
4. [Escolher o modelo pela métrica certa](../trilhas-extras/mlops/exercicios/01-escolher-a-metrica/), não pela acurácia.
5. [Alerta de drift](../trilhas-extras/mlops/exercicios/02-alerta-de-drift/) com dois critérios.

## 📚 Consulta

Docs de teoria em cada módulo e trilha (índice no [README](../README.md) e no [mapa da ementa](../ementa/mapa.md)) e 5 de
referência rápida: [cheatsheet](cheatsheet.md) de comandos, [glossário](glossario.md),
[armadilhas](armadilhas-comuns.md) (as marcadas com ⚡ aconteceram de verdade aqui),
[boas práticas](boas-praticas.md) e [referências](referencias.md) oficiais.

## ❌ O que ainda não dá para fazer

- **Rodar no OpenShift de verdade:** as Routes, a coleta de métricas pelo OpenShift (ServiceMonitor) e o
  pipeline no OpenShift AI precisam de um cluster real. O caminho gratuito é o
  [Developer Sandbox](https://developers.redhat.com/developer-sandbox) da Red Hat.
- **Modelos grandes:** sem GPU, os módulos usam um LLM de 4B e a trilha de LLMOps um de 0,5B: bons para
  aprender a operar, fracos em qualidade (erram conta simples).
- **Plataformas com conta, chave ou login:** OpenAI, Gemini, OpenRouter, Firebase, Gemini CLI, Jira/Slack/Notion,
  Infracost e deploy real de CI têm código e passo a passo prontos, mas não foram executados aqui.
