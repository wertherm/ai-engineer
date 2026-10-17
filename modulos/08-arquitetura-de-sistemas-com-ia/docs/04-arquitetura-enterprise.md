# 04 · Arquitetura enterprise de IA

## Objetivo

Ao terminar, você sabe desenhar a arquitetura de IA de uma empresa em camadas (API Gateway → orquestração →
serviços compartilhados → observabilidade), aplicar Loose Coupling, Clear Interfaces e Policy-Driven Control,
instrumentar observabilidade de IA (prompts, logs, métricas), escolher entre Kubernetes, Serverless e Edge e
controlar custo com roteamento e Model Tiering.

## Explicação

### O stack em camadas

```mermaid
flowchart TB
    subgraph Clientes
      APP[apps web/mobile] --- SVC[serviços internos] --- AG[agentes]
    end
    Clientes --> GW
    subgraph GW[AI Gateway]
      AUTH[auth / tenant] --> RL[rate limit + orçamento] --> POL[política de tiers e dados] --> RT[Model Router]
    end
    GW --> ORQ
    subgraph ORQ[Orquestração · Kubernetes / Serverless]
      W1[agentes e workflows] --- Q[(fila)] --- W2[workers de RAG / embeddings]
    end
    ORQ --> SH
    subgraph SH[Serviços compartilhados]
      LLM[modelos: API externa ou vLLM] --- VDB[(pgvector / vector DB)] --- C[(semantic cache)] --- HITL[aprovação humana]
    end
    GW -. traces, logs, métricas .-> OBS
    ORQ -. .-> OBS
    SH -. .-> OBS
    subgraph OBS[Observabilidade]
      OT[OpenTelemetry] --> P[Prometheus / Grafana] --- A[(audit trail)]
    end
```

- **Modularidade**: cada camada troca sem quebrar as outras (modelo novo, outro vector DB, outra fila).
- **Escalabilidade**: camadas sem estado (gateway, workers) escalam horizontalmente; o estado fica em fila, banco e cache.
- **Segurança**: autenticação e política no gateway; segredos fora do código; dado sensível mascarado antes do modelo;
  prompt injection tratado como entrada não confiável (ver [módulo 03 · segurança e governança](../../03-mcp/docs/04-seguranca-e-governanca.md)).

### Três princípios

| Princípio | Na prática | No módulo |
|---|---|---|
| **Loose Coupling** | serviços falam com "um LLM compatível com OpenAI" via `OPENAI_BASE_URL`, não com um fornecedor; agentes só conhecem tópicos de fila | `comum/llm.js`, [ex. 03](../exemplos/03-multiagente-com-fila/) |
| **Clear Interfaces** | contrato estável entre partes (mesma interface para `FilaMemoria` e `FilaPostgres`; mesma assinatura para as 4 buscas) | [ex. 03](../exemplos/03-multiagente-com-fila/), [ex. 04](../exemplos/04-padroes-de-rag/) |
| **Policy-Driven Control** | regras de acesso, tiers, orçamento e aprovação em arquivo versionado, aplicadas num ponto central | `gateway.config.json` ([ex. 07](../exemplos/07-gateway-de-ia/)), `politica.json` ([ex. 06](../exemplos/06-hitl-approval-gate/)) |

### Observabilidade de IA

O que registrar em cada chamada de modelo:

- **Trace**: `traceparent` (W3C) do pedido do usuário atravessando gateway → agente → ferramentas → modelo.
- **Log estruturado** (JSON): tenant, tier, modelo, versão do prompt, tokens de entrada/saída, custo, latência, TTFT, status.
- **Métricas**: pedidos por status, tokens e custo por tenant/tier, latência p50/p95, taxa de hit do cache, taxa de
  escalonamento para humano.
- **Prompts e respostas**: úteis para depurar e avaliar, mas são dado sensível. Amostre, mascare PII, restrinja
  acesso e defina retenção. O [exemplo 07](../exemplos/07-gateway-de-ia/) loga o tamanho do prompt, não o conteúdo.

As convenções **OpenTelemetry GenAI** (`gen_ai.request.model`, `gen_ai.usage.input_tokens` etc.) padronizam esses
atributos entre ferramentas. Métricas de servidor de modelo (TTFT, ITL, fila do vLLM) estão na
[trilha LLMOps](../../../trilhas-extras/llmops-vllm-openshift/docs/04-metricas-e-observabilidade.md).

### Implantação híbrida: Kubernetes, Serverless e Edge

| Alvo | Bom para | Cuidado |
|---|---|---|
| **Kubernetes** | gateway, workers, filas e modelos self-hosted (vLLM com GPU); controle fino de escala | custo fixo de cluster; GPU ociosa é cara |
| **Serverless** (Lambda, Cloud Run, Functions) | orquestração leve que chama APIs de modelo; tráfego irregular | cold start; timeout máximo; streaming longo |
| **Edge** (dispositivo, CDN workers) | modelos pequenos, privacidade, latência mínima, offline | memória/CPU limitados; atualizar modelo em milhares de dispositivos |

Arquitetura comum: classificação e redação de PII no **edge**, gateway e orquestração em **Kubernetes** ou
**serverless**, modelos grandes via **API** ou **vLLM** em nós com GPU. Kubernetes/OpenShift com vLLM está na
[trilha LLMOps · Kubernetes e OpenShift](../../../trilhas-extras/llmops-vllm-openshift/docs/06-kubernetes-e-openshift.md).

### Simulação de roteamento e controle de custos (Model Tiering)

Custo mensal ≈ Σ por tier (pedidos × (tokens de entrada × preço in + tokens de saída × preço out)). As alavancas, em
ordem de impacto típico: (1) não chamar o modelo (regra, cache); (2) chamar o modelo mais barato que resolve
(roteador + tiers); (3) cortar tokens (prompt menor, `max_tokens`, menos contexto); (4) prompt cache e batch.
O [exercício 01](../exercicios/01-tier-e-orcamento/) simula 30 mil pedidos: roteamento por intenção corta 84% e a
política de orçamento mantém a conta abaixo do teto. Custo por token em infraestrutura própria:
[trilha LLMOps · custo e capacidade](../../../trilhas-extras/llmops-vllm-openshift/docs/08-custo-e-capacidade.md).

## Código mínimo

```js
// Policy-Driven Control no gateway: tudo é recusado ANTES de gastar token.
if (!cfg.tenants[tenant]) return responder(res, 401, { erro: 'tenant desconhecido' });
if (!cfg.tenants[tenant].tiers.includes(tier)) return responder(res, 403, { erro: 'tier não permitido' });
if (!consumirFicha(tenant)) return responder(res, 429, { erro: 'rate limit' });
```

Esboço de implantação do gateway em Kubernetes (ilustrativo, **não aplicado localmente**; o passo a passo real com
cluster está na trilha LLMOps):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: ai-gateway }
spec:
  replicas: 2                       # sem estado: escala horizontal
  selector: { matchLabels: { app: ai-gateway } }
  template:
    metadata:
      labels: { app: ai-gateway }
      annotations: { prometheus.io/scrape: "true", prometheus.io/port: "30806" }
    spec:
      containers:
        - name: gateway
          image: registry.exemplo/ai-gateway:1.0.0
          env:
            - { name: OPENAI_BASE_URL, value: "http://vllm.modelos.svc:8000/v1" }   # Loose Coupling
            - { name: OPENAI_API_KEY, valueFrom: { secretKeyRef: { name: llm, key: api-key } } }
          resources: { requests: { cpu: 100m, memory: 128Mi }, limits: { memory: 256Mi } }
          readinessProbe: { httpGet: { path: /health, port: 30806 } }
```

Observação: o rate limit em memória do exemplo vale **por réplica**; com 2 réplicas, use um armazenamento
compartilhado (Redis, Postgres) para o balde.

## Na prática

- [Exemplo 07 · AI Gateway com tenant, rate limit, tiers, tracing e métricas](../exemplos/07-gateway-de-ia/)
- [Exercício 01 · Model Tiering + orçamento](../exercicios/01-tier-e-orcamento/)

## Armadilhas

- **Cada serviço chamando o provedor direto**: sem ponto central não há orçamento, política nem trilha de auditoria.
- **Logar prompt completo** em produção: vazamento de dado pessoal e de segredo colado pelo usuário.
- **Label de métrica com valor livre** (header, user id, prompt): explode a cardinalidade do Prometheus.
- **Rate limit em memória com várias réplicas**: cada réplica tem o seu balde; o limite real vira N × o configurado.
- **Serverless para streaming longo**: timeout da plataforma corta a resposta no meio.

## Fontes

- OpenTelemetry · Semantic conventions for GenAI: https://opentelemetry.io/docs/specs/semconv/gen-ai/
- W3C · Trace Context: https://www.w3.org/TR/trace-context/
- Prometheus · Exposition formats e boas práticas de labels: https://prometheus.io/docs/instrumenting/exposition_formats/ · https://prometheus.io/docs/practices/naming/
- Kubernetes · Deployments: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- Microsoft · Azure API Management como AI gateway: https://learn.microsoft.com/en-us/azure/api-management/genai-gateway-capabilities
- AWS · Well-Architected Generative AI Lens: https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/generative-ai-lens.html
- Node.js · `node:http`: https://nodejs.org/api/http.html
