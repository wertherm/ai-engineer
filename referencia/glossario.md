# Glossário

| Termo | Significado |
|---|---|
| **Adaptador de LLM** | interface que isola o SDK e permite mock nos testes (módulo 02) |
| **Adapter (LoRA)** | arquivo pequeno que se aplica sobre um modelo base exato (módulo 09) |
| **ADK (Agent Development Kit)** | framework do Google para agentes (LlmAgent, FunctionTool, Workflow, Runner) (módulo 11) |
| **ADR** | registro de decisão de arquitetura (módulo 07) |
| **Agent loop** | ciclo percepção → raciocínio (LLM) → ação (tool) → feedback, até o objetivo ou um limite (módulo 04) |
| **Agentic RAG** | a recuperação vira ferramenta e o modelo decide se busca e o quê (módulo 08) |
| **AI RMF** | framework voluntário do NIST com as funções Govern, Map, Measure e Manage (módulo 10) |
| **Alias (MLflow)** | ponteiro móvel para uma versão de modelo registrado (`champion`, `challenger`) |
| **APC / prefix caching** | reaproveitar o KV cache de um prefixo de prompt já processado |
| **App Check** | atestação do Firebase de que a requisição vem do seu app (módulo 05) |
| **Approval Gate** | ponto em que a ação para até decisão da política ou de um humano (módulo 08) |
| **Attention** | cada token pondera os outros por softmax(QKᵀ/√d) (módulo 01) |
| **AVX-512 / AVX2** | instruções vetoriais da CPU; o vLLM em CPU recomenda AVX-512 |
| **axe-core** | motor de auditoria automática de acessibilidade (regras WCAG) que roda no navegador (módulo 05) |
| **Backoff exponencial com jitter** | espera crescente e aleatorizada entre retentativas (módulo 02) |
| **Backpropagation** | regra da cadeia que calcula o gradiente da loss em relação a cada peso (módulo 01) |
| **Baseline** | desempenho de uma estratégia trivial (ex.: chutar a classe majoritária) (módulo 01) |
| **BaseLlm (ADK)** | ponto de extensão do ADK para ligar qualquer modelo (módulo 11) |
| **BF16 (bfloat16)** | formato numérico de 16 bits com a faixa do FP32; o recomendado para vLLM em CPU |
| **Brag document** | registro contínuo de entregas com antes → depois e evidência (módulo 12) |
| **Broadcasting** | operar tensores de shapes diferentes "esticando" o menor (módulo 01) |
| **Cache de prefixo (`cached_tokens`)** | reaproveitamento do processamento de um início de prompt igual (módulo 02) |
| **Cache de respostas** | hash da requisição → resposta salva, com TTL; custo zero no acerto (módulo 02) |
| **Caminho crítico (CPM)** | tarefas com folga zero; atrasou uma, atrasou o projeto (módulo 07) |
| **Champion / challenger** | o modelo em produção e o candidato que precisa superá-lo para ser promovido |
| **Chat template** | formato com marcadores especiais que transforma `messages` no texto que o modelo espera |
| **Circuit breaker** | N falhas seguidas suspendem as ações automáticas (módulo 06) |
| **Citação verificada** | a resposta só passa se cada citação aponta para um trecho recuperado; senão falha fechado (módulo 11) |
| **Concept drift** | muda a relação entre entrada e alvo; só aparece com o rótulo verdadeiro |
| **conftest** | CLI que roda políticas Rego sobre JSON/YAML/HCL; `verify` roda os testes das políticas (módulo 06) |
| **Context stitching** | costurar o contexto em ordem fixa (global → fatos → resumo → local → janela recente) (módulo 04) |
| **Contexto ativo** | o que vai de fato na próxima chamada, montado sob um orçamento de tokens (módulo 04) |
| **Continuous batching** | agendar requisições a cada passo de geração, sem esperar o lote terminar |
| **CPI** | valor agregado / custo real (< 1 = gastando acima do plano) (módulo 07) |
| **CT (continuous training)** | retreino automático disparado por agenda, dados novos ou queda de desempenho |
| **Data drift** | a distribuição das entradas em produção se afasta da de treino |
| **Data leakage** | informação do conjunto de teste (ou do futuro) vazando para o treino |
| **Decision framework** | critério declarado (acerto, latência, custo) para escolher entre regra, LLM ou rota híbrida (módulo 08) |
| **Decode** | fase que gera um token por vez |
| **Deployment** | objeto Kubernetes que mantém N cópias de um pod e controla atualizações |
| **Digest (dataset)** | hash dos dados de treino gravado no run; muda quando os dados mudam |
| **Disparate impact** | menor taxa de seleção ÷ maior; abaixo de 0,8 é alerta (regra dos 4/5) (módulo 10) |
| **DLQ (dead-letter queue)** | destino das mensagens que esgotaram as tentativas (módulo 08) |
| **DNS rebinding** | site malicioso faz o navegador chamar um servidor em localhost; mitigado validando Host/Origin (módulo 03) |
| **Dry-run server** | validação pelo API server (admission, schema, defaults) sem persistir nada (módulo 06) |
| **Embedding** | vetor em que textos de significado parecido ficam próximos (módulo 01) |
| **Esquecimento catastrófico** | perda de habilidades gerais depois do ajuste (módulo 09) |
| **Experiment / run (MLflow)** | agrupamento de treinos / uma execução de treino com params, métricas e artefatos |
| **Falha fechada** | na dúvida, a guarda bloqueia e escala para um humano (módulo 10) |
| **Fallback por confiança** | caminho barato (OCR) e sobe para o caro (visão) quando a confiança é baixa (módulo 02) |
| **Few-shot** | exemplos de pergunta e resposta colocados no prompt para o modelo imitar |
| **Foundation model** | modelo pré-treinado genérico, ponto de partida do LLMOps |
| **Four-eyes** | quem pede não aprova (módulo 06) |
| **GEMINI.md** | arquivo de contexto que o Gemini CLI envia em todo prompt (módulo 05) |
| **Grounding** | conferir no código que o dado extraído existe na fonte (módulo 02) |
| **Guardrail** | limite de escopo, passos, orçamento ou allowlist checado antes da ação (módulo 04) |
| **Guardrails** | verificações de entrada e saída (segurança, PII, tópicos proibidos) em volta do modelo |
| **Histograma (Prometheus)** | métrica com `_bucket`, `_sum` e `_count`; permite média e percentis |
| **hit@k / MRR** | resposta entre os k trechos / média de 1/posição do primeiro trecho certo (módulo 01) |
| **HNSW** | índice aproximado (ANN) em grafo para busca vetorial (módulo 01) |
| **Host / Client / Server (MCP)** | o app de IA; o conector 1:1 dentro dele; o programa que expõe capacidades (módulo 03) |
| **Human-in-the-loop (interrupt)** | pausa o grafo com checkpoint até um humano responder (módulo 04) |
| **Hybrid Search** | busca vetorial e full-text combinadas (módulo 08) |
| **Igualdade de oportunidade** | TPR igual entre grupos (módulo 10) |
| **InferenceService** | objeto do KServe que declara "sirva este modelo com este runtime" |
| **Injeção indireta** | instrução maliciosa que chega por documento ou tool, não pelo usuário (módulo 10) |
| **IoU** | interseção sobre união de duas caixas; usado em detecção e tracking (módulo 01) |
| **ISO/IEC 42001** | norma certificável de sistema de gestão de IA (módulo 10) |
| **Isolation Forest** | detector de anomalias que isola pontos raros com árvores aleatórias (módulo 06) |
| **ITL / TPOT** | latência entre tokens / tempo por token de saída |
| **KFP (Kubeflow Pipelines)** | orquestrador de pipelines de ML em Kubernetes; base dos AI Pipelines do OpenShift AI |
| **kind** | *Kubernetes IN Docker*: um cluster Kubernetes local dentro de containers |
| **KS (Kolmogorov-Smirnov)** | teste estatístico que compara duas distribuições numéricas |
| **KServe** | camada de serving de modelos sobre Kubernetes, usada pelo OpenShift AI |
| **KV cache** | vetores Key/Value dos tokens já processados, guardados para não recalcular |
| **Lei de Little** | concorrência = taxa de chegada × tempo no sistema (módulo 12) |
| **LLM-as-judge** | usar um modelo para avaliar as respostas de outro |
| **llm-d** | projeto de inferência distribuída de LLM em Kubernetes, com roteamento ciente de KV cache |
| **LLMOps** | práticas para colocar e manter LLMs em produção |
| **LoggedModel** | no MLflow 3, o modelo salvo como entidade própria, com URI `models:/m-<id>` |
| **LoRA** | correção de posto baixo ΔW = B·A nas camadas; salva só o adapter (módulo 09) |
| **max_model_len** | número máximo de tokens (entrada + saída) por requisição |
| **MCP** | protocolo aberto (JSON-RPC 2.0) que padroniza como apps de IA acessam tools e dados (módulo 03) |
| **MCP Apps** | extensão oficial do MCP para UI interativa (recurso `ui://`, iframe sandbox, postMessage) (módulo 05) |
| **MCP-UI** | SDKs comunitários (`@mcp-ui/server`, `@mcp-ui/client`) compatíveis com MCP Apps (módulo 05) |
| **Memória episódica** | registro do que aconteceu numa execução e da lição, recuperado por embedding (módulo 04) |
| **Micro-SaaS** | produto de software por assinatura, pequeno, operado por uma ou poucas pessoas (módulo 11) |
| **MLflow** | plataforma open source de tracking, registro e serving de modelos |
| **MLOps** | práticas para colocar e manter modelos de ML em produção: dados, código e modelo versionados, automação e monitoramento |
| **MLServer** | servidor de inferência para modelos clássicos (sklearn, XGBoost); runtime do KServe no OpenShift AI |
| **Model card** | documento padronizado de uso, métricas e limitações de um modelo (módulo 10) |
| **Model Registry** | catálogo de modelos com versões, aliases e metadados |
| **Model Tiering** | tiers de modelo com preço, limites e política de uso (módulo 08) |
| **MoSCoW** | Must, Should, Could, Won't (módulo 07) |
| **Multi-tenant pool** | todos os clientes na mesma tabela, separados por `tenant_id` em toda consulta (módulo 11) |
| **OpenShift AI** | plataforma de IA da Red Hat sobre o OpenShift (notebooks, pipelines, serving) |
| **P85** | data que 85% dos cenários do Monte Carlo cumprem (módulo 07) |
| **PagedAttention** | KV cache em páginas de tamanho fixo, como memória virtual |
| **PEFT** | técnicas que treinam poucos parâmetros extras com o modelo congelado (módulo 09) |
| **Plan-and-Execute / ReWOO** | o planner gera o plano inteiro e o executor roda sem LLM (módulo 04) |
| **Plano JSON (tofu show -json)** | o que o IaC vai fazer, com valores efetivos; entrada ideal para política (módulo 06) |
| **Policy-as-Code** | regras da plataforma em código versionado e testado (Rego/OPA, Sentinel), avaliadas no pipeline (módulo 06) |
| **Policy-Driven Control** | regras de acesso, tier e orçamento em arquivo versionado aplicadas num ponto central (módulo 08) |
| **Portão de aceitação** | testes humanos escritos a partir da spec que decidem se o código gerado entra (módulo 05) |
| **Portão de qualidade (CI)** | script de avaliação que termina com exit 1 quando uma métrica fica abaixo do limiar (módulo 11) |
| **Post-mortem blameless** | análise de incidente focada em sistemas e processos, não em pessoas (módulo 06) |
| **PR-first** | o copilot nunca aplica; entrega o PR com os checks e um humano aprova (módulo 06) |
| **Prediction drift** | a distribuição das previsões do modelo muda |
| **Preempção** | tirar uma requisição em andamento por falta de KV cache |
| **Prefill** | fase que processa o prompt inteiro antes do 1º token |
| **Probe** | verificação periódica do Kubernetes: startup, readiness, liveness |
| **Profile README** | repositório com o nome do usuário exibido no perfil do GitHub (módulo 12) |
| **Project** | namespace do OpenShift com permissões e cotas |
| **Prompt chaining** | dividir a tarefa em chamadas pequenas; a saída validada de uma é a entrada da próxima (módulo 02) |
| **Prompt template** | prompt versionado (`id@versao`) com variáveis declaradas (módulo 02) |
| **Proxy de IA** | back-end que guarda a chave, o prompt de sistema e o rate limit; o browser nunca fala com o provedor (módulo 05) |
| **Pseudonimização** | troca reversível de PII por marcadores; continua sendo dado pessoal (LGPD) (módulo 10) |
| **PSI (Population Stability Index)** | medida do tamanho da mudança de distribuição; > 0,25 = significativa (convenção) |
| **PVC** | pedido de armazenamento persistente para um pod |
| **Quantização** | representar pesos com menos bits (INT8, INT4, FP8) para caber e rodar mais rápido |
| **Rank (r) / alpha** | capacidade do LoRA / escala α/r da correção (módulo 09) |
| **ReAct** | padrão que intercala pensamento, ação e observação; uma chamada ao LLM por passo (módulo 04) |
| **Recall** | dos casos positivos reais, quantos o modelo acertou; aqui, dos tumores malignos |
| **Reflection** | o agente critica a própria saída contra critérios e revisa (módulo 04) |
| **Reponderação** | pesos P(g)·P(y)/P(g,y) no treino para desacoplar grupo e rótulo (módulo 10) |
| **RICE** | (Reach × Impact × Confidence) / Effort (módulo 07) |
| **ROC AUC** | capacidade do modelo de ordenar positivos acima de negativos (1,0 = perfeito) |
| **Route** | objeto do OpenShift que expõe um Service para fora, com TLS |
| **RRF (Reciprocal Rank Fusion)** | funde rankings somando 1/(60+posição), sem normalizar escores (módulo 08) |
| **S2I** | *source-to-image*: build da imagem a partir do código-fonte, no cluster |
| **Sampling** | regra de escolha do próximo token (`temperature`, `top_p`, `seed`) |
| **SCC** | *Security Context Constraints*: política de segurança de pods do OpenShift (`restricted-v2` por padrão) |
| **Semantic Cache** | reaproveita a resposta de pergunta com embedding parecido acima de um limiar (módulo 08) |
| **Service token** | credencial Bearer máquina-a-máquina com escopos e expiração; guarda-se só o hash (módulo 03) |
| **ServiceMonitor** | objeto que manda o Prometheus coletar o `/metrics` de um Service |
| **ServingRuntime** | objeto do KServe que descreve o container que serve modelos (ex.: vLLM) |
| **SFT** | fine-tuning supervisionado com pares entrada → saída ideal (módulo 09) |
| **Signature (MLflow)** | contrato de colunas e tipos de entrada e saída do modelo |
| **SLO** | *Service Level Objective*: meta mensurável de serviço (ex.: TTFT p95 ≤ 2 s) |
| **Split estratificado** | mantém a proporção das classes em cada conjunto (módulo 09) |
| **SSI** | Social Selling Index do LinkedIn (0–100, 4 pilares); métrica de vendas (módulo 12) |
| **STAR** | Situação, Tarefa, Ação, Resultado — estrutura de resposta comportamental (módulo 12) |
| **Streamable HTTP** | transporte remoto do MCP num endpoint único (POST, resposta JSON ou SSE) (módulo 03) |
| **Structured outputs** | `response_format: json_schema`; o servidor restringe a geração ao schema (módulo 02) |
| **structuredContent / outputSchema** | saída JSON tipada e validada de uma tool MCP (módulo 03) |
| **Supervisor (multiagente)** | agente central que roteia mensagens entre especialistas (módulo 04) |
| **Tensor** | array N-dimensional com shape e dtype; base da conta de uma rede neural (módulo 01) |
| **Tensor parallelism** | dividir cada camada do modelo entre várias GPUs |
| **Text-to-UI** | gerar interface (HTML/CSS/componente) a partir de uma descrição em linguagem natural (módulo 05) |
| **Throughput** | tokens (ou requisições) por segundo que o sistema entrega |
| **Throughput forecasting** | Monte Carlo sorteando semanas do histórico de itens entregues (módulo 07) |
| **Token** | pedaço de texto do vocabulário do modelo; unidade de custo e de contexto |
| **Token passthrough** | repassar ao downstream o token recebido do client; proibido pela spec MCP (módulo 03) |
| **Tool / Resource / Prompt (MCP)** | ação que o modelo decide chamar; dado somente leitura por URI; template escolhido pelo usuário (módulo 03) |
| **Tool annotations** | dicas readOnlyHint/destructiveHint/idempotentHint; não são controle de segurança (módulo 03) |
| **Tool poisoning** | instruções maliciosas escondidas na descrição de uma tool de terceiros (módulo 03) |
| **Training-serving skew** | diferença entre como os dados são tratados no treino e no serving |
| **Trilha com hash encadeado** | cada linha guarda o hash da anterior; editar uma linha antiga é detectado (módulo 07) |
| **TTFT** | tempo até o primeiro token |
| **Vazamento treino→validação** | o mesmo exemplo nos dois conjuntos infla a métrica (módulo 09) |
| **WCAG 2.5.3 (Label in Name)** | o nome acessível tem que conter o texto visível do rótulo (módulo 05) |
| **WSJF** | Cost of Delay / Job Size; CoD = valor de negócio + criticidade no tempo + redução de risco (módulo 07) |
| **xfail** | teste marcado como "falha esperada" no pytest |
| **z-score robusto (MAD)** | anomalia medida com mediana e desvio absoluto mediano (módulo 07) |
| **Âncora (negociação)** | o primeiro número, que puxa a conversa (módulo 12) |
