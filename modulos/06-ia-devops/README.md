# Módulo 06 · Ferramentas de IA para DevOps

Como usar LLMs e ML em infraestrutura sem perder o controle: IaC copilot, agentes de deploy e de
troubleshooting no Kubernetes, AIOps, ChatOps com aprovação, segurança, FinOps e auto-remediação, sempre com
o princípio **o LLM propõe, ferramentas determinísticas validam e humanos aprovam ações críticas**.

Estudado em 2026-10-17 com OpenTofu **1.13.1**, conftest **0.71.0** (OPA 1.21.0), Trivy **0.75.0**, kubectl
**1.37** + kind (Kubernetes 1.37.0), `openai` **7.34.0**, scikit-learn **1.9.1** e o modelo local `qwen3.5:4b` (Ollama). Versão Python (2026-10-18): Python 3.14, `openai` 3.35.1 (PyPI),
`psycopg` 3.3.6, `pgvector` 0.5.1, PyYAML 6.0.3, pytest 9.1.1; mesmos binários chamados por `subprocess`.

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| **I · Fundamentos de IA generativa para infra** | |
| Arquitetura de LLMs | [doc 01](docs/01-fundamentos-ia-generativa-para-infra.md#arquitetura-de-llms-do-ponto-de-vista-de-quem-opera-infra) |
| APIs (OpenAI, Anthropic Claude, AWS Bedrock) | [doc 01](docs/01-fundamentos-ia-generativa-para-infra.md#apis-openai-anthropic-claude-e-aws-bedrock) (OpenAI-compatível executado em todos os exemplos; Anthropic/Bedrock: não executado localmente, exigem chave/conta) |
| Frameworks de agentes (LangChain, CrewAI, AutoGen) | [doc 01](docs/01-fundamentos-ia-generativa-para-infra.md#frameworks-de-agentes-langchain-crewai-autogen) (conceitual; LangGraph executado no [módulo 04](../04-agentes-autonomos/)) |
| RAG aplicado a documentação técnica | [doc 01](docs/01-fundamentos-ia-generativa-para-infra.md#rag-aplicado-à-documentação-técnica) · [exercício 02](exercicios/02-runbook-rag-e-postmortem/) |
| Padrões de prompting para infraestrutura | [doc 01](docs/01-fundamentos-ia-generativa-para-infra.md#padrões-de-prompting-para-infraestrutura) · [exemplo 01](exemplos/01-iac-copilot-terraform/) |
| Limitações, alucinações e validação | [doc 01](docs/01-fundamentos-ia-generativa-para-infra.md#limitações-alucinações-e-validação) · [exemplo 01](exemplos/01-iac-copilot-terraform/) (alucinações reais registradas) |
| **II · IaC Copilot** | |
| Linguagem natural → IaC | [exemplo 01](exemplos/01-iac-copilot-terraform/) |
| Geração de Terraform, Pulumi e Helm | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#iac-copilot-de-linguagem-natural-a-iac-validada) · [exemplo 01](exemplos/01-iac-copilot-terraform/) (OpenTofu; Pulumi e Helm: não executado localmente) |
| Validação automatizada (`validate`/`plan`) | [exemplo 01](exemplos/01-iac-copilot-terraform/) (`validar.js`) |
| Policy-as-Code (OPA, Sentinel) | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#policy-as-code-opa-e-sentinel) · [exemplo 01](exemplos/01-iac-copilot-terraform/) · [exercício 01](exercicios/01-politica-opa-nova/) (Sentinel: não executado localmente, exige HCP Terraform) |
| Workflow PR-first com revisão assistida | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#workflow-pr-first-com-revisão-assistida) · [exemplo 01](exemplos/01-iac-copilot-terraform/) (`trabalho/PR.md`) |
| Drift de infraestrutura | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#drift-de-infraestrutura) (conceitual) |
| Prática 1: copilot que gera módulos Terraform validados | [exemplo 01](exemplos/01-iac-copilot-terraform/) · [exercício 01](exercicios/01-politica-opa-nova/) |
| **III · Agentes para Kubernetes** | |
| Manifests YAML a partir de linguagem natural | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#manifests-a-partir-de-linguagem-natural) · [exemplo 02](exemplos/02-agente-de-deploy-kind/) |
| HPA e VPA; autoscaling por métricas customizadas | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#escalonamento-hpa-vpa-e-métricas-customizadas) · [exemplo 02](exemplos/02-agente-de-deploy-kind/) (HPA criado; sem metrics-server no kind; VPA/KEDA conceituais) |
| Ingress, Services e Network Policies | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#rede-service-ingress-e-networkpolicy) · [exemplo 02](exemplos/02-agente-de-deploy-kind/) (Service) |
| Rollout/rollback (canary, blue-green, progressive delivery) | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#rollout-e-rollback) · [exemplo 02](exemplos/02-agente-de-deploy-kind/) (rolling + rollback automático; canary/blue-green conceituais) |
| GitOps (Argo CD, Flux) | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#gitops-argo-cd-e-flux) (não executado localmente: exige instalar os controllers) |
| Prática 2: agente de deploy end-to-end com validação de readiness | [exemplo 02](exemplos/02-agente-de-deploy-kind/) |
| **IV · Troubleshooting assistido** | |
| ReAct para troubleshooting | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#troubleshooting-assistido-com-react) · [exemplo 03](exemplos/03-troubleshooting-react/) |
| CrashLoopBackOff, ImagePullBackOff, OOMKilled | [exemplo 03](exemplos/03-troubleshooting-react/) (acerto medido nos 3 casos) |
| Análise de logs e stack traces | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#logs-stack-traces-e-traces-distribuídos) · [exemplo 03](exemplos/03-troubleshooting-react/) (`logs_pod`) |
| Correlação de traces (Jaeger, Zipkin) e métricas | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#logs-stack-traces-e-traces-distribuídos) (não executado localmente: sem stack de tracing na infra) |
| Latência, 5xx e degradação; sugestão de fixes | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#logs-stack-traces-e-traces-distribuídos) · [exemplo 03](exemplos/03-troubleshooting-react/) (campo `correcao`) |
| Prática 3: diagnóstico automático de pods | [exemplo 03](exemplos/03-troubleshooting-react/) |
| **V · AIOps e observabilidade** | |
| NL → PromQL e LogQL | [exemplo 04](exemplos/04-aiops-anomalias-e-promql/) (PromQL validado pelo `promtool`) · [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#aiops-nl--promql-e-logql) (LogQL: não executado localmente, sem Loki) |
| Dashboards Grafana | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#dashboards-grafana) · [exemplo 04](exemplos/04-aiops-anomalias-e-promql/) (dashboard HTML estático no lugar do Grafana) |
| Anomalias com ML (Prophet, Isolation Forest) | [exemplo 04](exemplos/04-aiops-anomalias-e-promql/) (Isolation Forest; Prophet conceitual no [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#detecção-de-anomalias-com-ml)) |
| Correlação métricas/logs/traces | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#correlação-alertas-preditivos-e-forecasting) |
| Alertas preditivos e redução de falsos positivos | [exemplo 04](exemplos/04-aiops-anomalias-e-promql/) (debounce + alerta "CPU passa de 85% em …") |
| Forecasting de recursos | [exemplo 04](exemplos/04-aiops-anomalias-e-promql/) (backtest com MAE) |
| Prática 4: dashboard com detecção de anomalias | [exemplo 04](exemplos/04-aiops-anomalias-e-promql/) (`saida/dashboard.html`) |
| **VI · ChatOps com aprovação humana** | |
| Bots para Slack, Discord, Teams | [doc 04](docs/04-chatops-runbooks-e-auto-remediacao.md#chatops-com-aprovação-humana) (adaptadores: não executado localmente, exigem workspace/token) |
| Comandos seguros /deploy, /scale, /rollback, /investigar | [exemplo 05](exemplos/05-chatops-com-aprovacao/) |
| Diffs e análise de impacto | [exemplo 05](exemplos/05-chatops-com-aprovacao/) (dry-run + `kubectl diff`) |
| Aprovação com guardrails e circuit breakers | [exemplo 05](exemplos/05-chatops-com-aprovacao/) |
| RBAC | [exemplo 05](exemplos/05-chatops-com-aprovacao/) · [doc 04](docs/04-chatops-runbooks-e-auto-remediacao.md#segurança-das-ações-rbac-no-kubernetes-também) |
| Auditoria | [exemplo 05](exemplos/05-chatops-com-aprovacao/) (`m06.chatops_auditoria`) |
| Prática 5: bot de ChatOps com aprovação | [exemplo 05](exemplos/05-chatops-com-aprovacao/) |
| **VII · Segurança e compliance** | |
| Scan de IaC e containers (Snyk, Trivy, Checkov) | [exemplo 06](exemplos/06-seguranca-scan-e-ai-fix/) (Trivy) · [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#segurança-e-compliance) (Checkov conceitual; Snyk: não executado localmente, exige login) |
| "AI fix" de vulnerabilidades | [exemplo 06](exemplos/06-seguranca-scan-e-ai-fix/) (fix + re-scan) |
| Vazamento de secrets | [exemplo 06](exemplos/06-seguranca-scan-e-ai-fix/) (`trivy fs --scanners secret`) |
| Explicar políticas OPA em linguagem natural | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#policy-as-code-opa-e-sentinel) · [exercício 01](exercicios/01-politica-opa-nova/) (bônus: desafio sem solução executada) |
| Remediação de CVEs | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#segurança-e-compliance) · [exemplo 06 · Experimente](exemplos/06-seguranca-scan-e-ai-fix/) (`trivy image`) |
| Relatórios de compliance (SOC2, ISO 27001, PCI-DSS) | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#segurança-e-compliance) (`trivy --compliance`; mapeamento formal SOC2/ISO/PCI: não executado localmente, ferramentas comerciais) |
| **VIII · CI/CD Copilot** | |
| Gerar pipelines (GitLab CI, GitHub Actions, Jenkins) | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#cicd-copilot) (não executado localmente: roda nas plataformas) |
| Gates (testes, SAST, DAST, dependency scanning) | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#cicd-copilot) · gates de IaC executados no [exemplo 01](exemplos/01-iac-copilot-terraform/) e [06](exemplos/06-seguranca-scan-e-ai-fix/) |
| Impacto em PRs; estratégias de deploy; cache e tempo de build | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#cicd-copilot) |
| Rollback por métricas | [doc 03](docs/03-kubernetes-troubleshooting-e-aiops.md#rollout-e-rollback) · [exemplo 02](exemplos/02-agente-de-deploy-kind/) (por readiness) |
| **IX · FinOps** | |
| Custo em PRs com Infracost | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#finops-com-ia) (não executado localmente: exige chave do Infracost) |
| Rightsizing de pods/nodes; spot e reservadas; recursos ociosos | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#finops-com-ia) (conceitual) |
| Forecasting de custo | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#finops-com-ia) · técnica executada no [exemplo 04](exemplos/04-aiops-anomalias-e-promql/) |
| Armazenamento e rede | [doc 02](docs/02-iac-cicd-seguranca-e-finops.md#finops-com-ia) (conceitual) |
| **X · RAG de runbooks e post-mortem** | |
| Arquitetura de RAG para docs internas; indexação de playbooks/READMEs/wikis | [doc 04](docs/04-chatops-runbooks-e-auto-remediacao.md#rag-de-runbooks-e-post-mortem) · [exercício 02](exercicios/02-runbook-rag-e-postmortem/) |
| Agente que consulta e executa runbooks | [exercício 02](exercicios/02-runbook-rag-e-postmortem/) |
| Timelines de incidente; lessons learned; post-mortem blameless | [exercício 02](exercicios/02-runbook-rag-e-postmortem/) |
| **XI · Auto-remediação com guardrails** | |
| Playbooks por alerta; alerta → verificação → mitigação → validação | [doc 04](docs/04-chatops-runbooks-e-auto-remediacao.md#auto-remediação-com-guardrails) · [exercício 02](exercicios/02-runbook-rag-e-postmortem/) |
| Canary com rollback | [doc 04](docs/04-chatops-runbooks-e-auto-remediacao.md#auto-remediação-com-guardrails) · [exemplo 02](exemplos/02-agente-de-deploy-kind/) |
| Circuit breakers e rate limiting | [exemplo 05](exemplos/05-chatops-com-aprovacao/) |
| Dry-run; human-in-the-loop | [exercício 02](exercicios/02-runbook-rag-e-postmortem/) · [exemplo 05](exemplos/05-chatops-com-aprovacao/) |
| **XII · Projeto integrador** | |
| Agente/copilot completo; IaC + K8s + observabilidade; guardrails | [doc 04](docs/04-chatops-runbooks-e-auto-remediacao.md#projeto-integrador-o-copilot-de-plataforma) (mapa das peças dos exemplos 01–06) |
| Testes e simulação; ROI | [doc 04](docs/04-chatops-runbooks-e-auto-remediacao.md#projeto-integrador-o-copilot-de-plataforma) (cenários com gabarito dos exemplos 03/04; conta de ROI) |

## Pré-requisitos

- Infra do repositório no ar (Ollama + Postgres/pgvector): a partir da raiz, `bash infra/subir-ia.sh`.
- Node 22+ e, na pasta do módulo, `npm install`.
- Python 3.14 via [`uv`](https://docs.astral.sh/uv/): o módulo tem `pyproject.toml` próprio (versões exatas, `uv.lock`);
  na pasta do módulo, `uv sync` (exemplo 04 · `anomalias.py` e toda a versão Python dos exemplos/exercícios).
- Cluster kind `estudo` (exemplos 02, 03, 05, 06 e exercício 02): `docker start estudo-control-plane`
  (contexto `kind-estudo`; todo `kubectl` do módulo usa `--context kind-estudo`, nunca o contexto atual).
- Docker com a imagem `prom/prometheus:v3.15.0` (exemplo 04, `promtool`).
- Binários em `~/.local/bin`, baixados do release oficial com SHA-256 conferido:

```bash
cd "$(mktemp -d)"
V=1.13.1; curl -sSLO https://github.com/opentofu/opentofu/releases/download/v$V/tofu_${V}_linux_amd64.tar.gz \
  && curl -sSLo SUMS https://github.com/opentofu/opentofu/releases/download/v$V/tofu_${V}_SHA256SUMS \
  && grep " tofu_${V}_linux_amd64.tar.gz$" SUMS | sha256sum -c - && tar -xzf tofu_*.tar.gz tofu && install -m755 tofu ~/.local/bin/
V=0.71.0; curl -sSLO https://github.com/open-policy-agent/conftest/releases/download/v$V/conftest_${V}_Linux_x86_64.tar.gz \
  && curl -sSLo SUMS https://github.com/open-policy-agent/conftest/releases/download/v$V/checksums.txt \
  && grep " conftest_${V}_Linux_x86_64.tar.gz$" SUMS | sha256sum -c - && tar -xzf conftest_*.tar.gz conftest && install -m755 conftest ~/.local/bin/
V=0.75.0; curl -sSLO https://github.com/aquasecurity/trivy/releases/download/v$V/trivy_${V}_Linux-64bit.tar.gz \
  && curl -sSLo SUMS https://github.com/aquasecurity/trivy/releases/download/v$V/trivy_${V}_checksums.txt \
  && grep " trivy_${V}_Linux-64bit.tar.gz$" SUMS | sha256sum -c - && tar -xzf trivy_*.tar.gz trivy && install -m755 trivy ~/.local/bin/
tofu version && conftest --version && trivy --version
```

Variáveis (com os defaults de `infra/.env.example`): `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODELO_CHAT`,
`MODELO_EMBED`, `DATABASE_URL`; extras deste módulo: `KUBE_CONTEXT` (default `kind-estudo`),
`MAX_TENTATIVAS` e `POLITICAS_EXTRAS` (exemplo 01), `IMAGEM_PROM` (exemplo 04).

> Tempo: o `qwen3.5:4b` em CPU, compartilhado com outros processos, levou **de 1 a 8 minutos por chamada**
> nas execuções registradas aqui. O cliente ([`comum/llm.js`](comum/llm.js)) usa o `fetch` do `undici` sem
> corte de headers e timeout de 600 s no SDK.

## Como rodar

```bash
cd modulos/06-ia-devops
npm install
npm run ex01            # IaC copilot: NL → OpenTofu → validate/plan/OPA → PR
npm run ex02            # agente de deploy no kind: dry-run → apply → readiness → rollback
npm run ex03            # troubleshooting ReAct em 3 pods quebrados (acerto medido)
npm run ex04:anomalias  # Isolation Forest + forecast + dashboard (Python, sem LLM)
npm run ex04:promql     # NL → PromQL validado pelo promtool + catálogo
npm run ex05            # ChatOps com RBAC, four-eyes, circuit breaker e auditoria
npm run ex06            # Trivy + AI fix + re-scan
npm run exe01           # exercício 01: política OPA nova + copilot
npm run exe02 -- --auto-aprovar   # exercício 02: RAG de runbooks + remediação + post-mortem
npm run limpar:k8s      # apaga os namespaces m06-* se algum exemplo foi rodado com --manter
```

Versão Python (mesmas pastas, subpasta `python/`; `exemplos/04-…/anomalias.py` já era Python):

```bash
cd modulos/06-ia-devops
uv sync
uv run python exemplos/01-iac-copilot-terraform/python/main.py
uv run python exemplos/02-agente-de-deploy-kind/python/main.py
uv run python exemplos/03-troubleshooting-react/python/main.py
uv run python exemplos/04-aiops-anomalias-e-promql/anomalias.py          # já era Python
uv run python exemplos/04-aiops-anomalias-e-promql/python/promql.py      # --sem-llm: só o autoteste
uv run python exemplos/05-chatops-com-aprovacao/python/main.py           # --interativo
uv run python exemplos/06-seguranca-scan-e-ai-fix/python/main.py
uv run python exercicios/01-politica-opa-nova/solucao/python/solucao.py  # --sem-llm
uv run python exercicios/02-runbook-rag-e-postmortem/solucao/python/solucao.py --auto-aprovar
uv run pytest                                                            # guardrails determinísticos (sem LLM/cluster)
kubectl --context kind-estudo delete ns m06py-deploy m06py-troubleshoot m06py-chatops m06py-runbook --ignore-not-found
```

Os exemplos de cluster criam e apagam o próprio namespace (`m06-deploy`, `m06-troubleshoot`, `m06-chatops`,
`m06-runbook`; na versão Python, `m06py-*`). Dados no Postgres ficam só no schema `m06` (tabelas da versão
Python com sufixo `_py`).

## Status de verificação

| Item | Status (JS) | Status (Python) |
|---|---|---|
| Exemplo 01 · IaC copilot (OpenTofu + conftest) | ✅ executado: aprovado na 3ª tentativa (validate → OPA → ok); execuções anteriores sem grounding/sem dica de schema registradas no README do exemplo | ✅ `python/main.py`: aprovado na 3ª tentativa, mesmas tentativas e tokens do JS |
| Exemplo 02 · agente de deploy no kind | ✅ executado: release 1 pronta, release 2 (tag inexistente) revertida automaticamente | ✅ `python/main.py`: release 1 pronta em 3s, release 2 revertida (`m06py-deploy`) |
| Exemplo 03 · troubleshooting ReAct | ✅ executado: acerto de categoria agente 2/3 · regras 3/3 | ✅ `python/main.py`: agente 2/3 · regras 3/3 (`m06py-troubleshoot`) |
| Exemplo 04 · anomalias + forecast + dashboard (Python) | ✅ executado (determinístico) | ✅ já era Python: roda com o `pyproject.toml` do módulo, saída idêntica |
| Exemplo 04 · NL → PromQL | ✅ executado: 2/3 aprovadas pelos validadores (1 delas semanticamente errada, ver README) | ✅ `python/promql.py`: 2/3 aprovadas (mesmas expressões do JS) |
| Exemplo 05 · ChatOps com aprovação | ✅ executado no kind + Postgres (`m06.chatops_auditoria`) | ✅ `python/main.py`: mesmas decisões, auditoria em `m06.chatops_auditoria_py` |
| Exemplo 06 · Trivy + AI fix + re-scan | ✅ executado: fix rejeitado pelo dry-run server e pelo re-scan (comportamento esperado) | ✅ `python/main.py`: mesmo fix rejeitado (dry-run server + `KSV-0125` novo) |
| Exercício 01 · política OPA nova | ✅ executado: `conftest verify` 4/4; copilot aprovado na 2ª tentativa com `length = 32` | ✅ `solucao/python/solucao.py`: verify 4/4; copilot aprovado na 2ª tentativa com `length = 32` |
| Exercício 02 · RAG de runbooks + post-mortem | ✅ executado no kind + pgvector (`m06.runbooks`, `m06.postmortems`) | ✅ `solucao/python/solucao.py`: mesmo runbook (0.711), `m06.runbooks_py`/`m06.postmortems_py` |
| Anthropic Messages API / AWS Bedrock Converse | ⚠️ não executado localmente: exigem chave/conta | ⚠️ idem |
| Pulumi, Helm, Sentinel, Argo CD, Flux, Argo Rollouts/Flagger | ⚠️ não executado localmente: CLI/conta próprias ou controllers fora do escopo do kind de estudo | ⚠️ idem |
| Adaptadores Slack/Discord/Teams | ⚠️ não executado localmente: exigem workspace, app e token | ⚠️ idem |
| Infracost, Snyk, mapeamento SOC2/ISO/PCI | ⚠️ não executado localmente: exigem chave/login/ferramenta comercial | ⚠️ idem |
| GitHub Actions / GitLab CI / Jenkins | ⚠️ não executado localmente: rodam nas plataformas (YAML de exemplo no doc 02) | ⚠️ idem |
| Loki/LogQL, Grafana, Jaeger/Zipkin, metrics-server, VPA | ⚠️ não executado localmente: não fazem parte da infra do repo (conceitos no doc 03) | ⚠️ idem |

## Fontes

- OpenTofu: https://opentofu.org/docs/ · releases: https://github.com/opentofu/opentofu/releases
- Conftest: https://www.conftest.dev/ · OPA/Rego: https://www.openpolicyagent.org/docs
- Trivy: https://trivy.dev/latest/docs/ · releases: https://github.com/aquasecurity/trivy/releases
- Kubernetes (Deployments, HPA, debug de pods): https://kubernetes.io/docs/
- kind: https://kind.sigs.k8s.io/
- Prometheus/promtool: https://prometheus.io/docs/prometheus/latest/command-line/promtool/
- scikit-learn IsolationForest: https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html
- SDK `openai` (npm): https://www.npmjs.com/package/openai · undici: https://undici.nodejs.org/
- Versão Python: SDK `openai` https://pypi.org/project/openai/ · psycopg 3 https://www.psycopg.org/psycopg3/docs/ · pgvector-python https://github.com/pgvector/pgvector-python · PyYAML https://pyyaml.org/wiki/PyYAMLDocumentation · uv https://docs.astral.sh/uv/
- Google SRE Book (post-mortem blameless): https://sre.google/sre-book/postmortem-culture/
- Fontes específicas em cada doc (`docs/*.md`, seção "Fontes").
