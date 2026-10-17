# Referências

Acessadas e conferidas em **2026-10-13**. Versões estudadas: vLLM 0.31.0 · OpenShift 4.22 ·
OpenShift AI 3.5 · Kubernetes (kubectl) 1.37 · kind 0.33 · Prometheus 3.15 ·
MLflow 3.17.1 · scikit-learn 1.9.1 · kfp 2.17.0.

## vLLM

- Documentação: https://docs.vllm.ai/en/latest/
- Instalação em CPU: https://docs.vllm.ai/en/latest/getting_started/installation/cpu.html
- Quickstart: https://docs.vllm.ai/en/latest/getting_started/quickstart.html
- Servidor OpenAI-compatível: https://docs.vllm.ai/en/latest/serving/online_serving/
- Métricas: https://docs.vllm.ai/en/latest/usage/metrics.html · https://docs.vllm.ai/en/latest/design/metrics.html
- Benchmark CLI: https://docs.vllm.ai/en/latest/benchmarking/cli.html
- Prefix caching: https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html
- Quantização: https://docs.vllm.ai/en/latest/features/quantization/
- Variáveis de ambiente: https://docs.vllm.ai/en/latest/configuration/env_vars.html
- Release 0.31.0: https://github.com/vllm-project/vllm/releases/tag/v0.31.0
- Imagem de CPU: https://hub.docker.com/r/vllm/vllm-openai-cpu/tags
- Paper PagedAttention: https://arxiv.org/abs/2309.06180
- GuideLLM: https://github.com/vllm-project/guidellm
- production-stack: https://github.com/vllm-project/production-stack

## OpenShift

- OCP 4.22 release notes: https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/release_notes/ocp-4-22-release-notes
- CLI `oc`: https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/cli_tools/openshift-cli-oc
- Projects: https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/building_applications/projects
- Routes: https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/ingress_and_load_balancing/routes
- SCC: https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/authentication_and_authorization/managing-pod-security-policies
- Criando imagens (UID arbitrário): https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/images/creating-images
- Cliente `oc` (download): https://mirror.openshift.com/pub/openshift-v4/x86_64/clients/ocp/stable/
- OpenShift Local (CRC): https://crc.dev/docs/installing/
- Developer Sandbox: https://developers.redhat.com/developer-sandbox
- OKD: https://okd.io/

## OpenShift AI e serving distribuído

- OpenShift AI 3.5, novidades: https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/release_notes/new-features-and-enhancements_relnotes
- EvalHub: https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/evaluating_ai_systems/evaluating-llms-with-evalhub_evaluate
- Red Hat AI Inference Server: https://docs.redhat.com/en/documentation/red_hat_ai_inference_server/3.2/html-single/release_notes/index
- llm-d: https://llm-d.ai/
- vLLM em CPU no OpenShift (artigo Red Hat, 2025): https://developers.redhat.com/articles/2025/06/17/how-run-vllm-cpus-openshift-gpu-free-inference

## Kubernetes

- kubectl: https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/
- kind: https://kind.sigs.k8s.io/docs/user/quick-start/
- Pod Security Standards: https://kubernetes.io/docs/concepts/security/pod-security-standards/
- Probes: https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/

## LLMOps, avaliação e observabilidade

- Red Hat, LLMOps: https://www.redhat.com/en/topics/ai/llmops
- Databricks, LLMOps: https://docs.databricks.com/aws/en/machine-learning/mlops/llmops
- Google Cloud, LLMOps: https://cloud.google.com/discover/what-is-llmops
- NVIDIA, conceitos de benchmark de LLM: https://developer.nvidia.com/blog/llm-benchmarking-fundamental-concepts/
- promptfoo + vLLM: https://www.promptfoo.dev/docs/providers/vllm/
- lm-evaluation-harness: https://github.com/EleutherAI/lm-evaluation-harness
- DeepEval: https://github.com/confident-ai/deepeval
- OpenTelemetry GenAI: https://github.com/open-telemetry/semantic-conventions-genai
- Langfuse: https://langfuse.com/integrations/native/opentelemetry
- LiteLLM + vLLM: https://docs.litellm.ai/docs/providers/vllm
- Prometheus, funções PromQL: https://prometheus.io/docs/prometheus/latest/querying/functions/

## MLOps

- Google Cloud, MLOps e níveis de maturidade: https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning
- Microsoft, MLOps maturity model: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/mlops-maturity-model
- *Hidden Technical Debt in ML Systems*: https://papers.nips.cc/paper_files/paper/2015/hash/86df7dcfd896fcaf2674f757a2463eba-Abstract.html
- MLflow 3: https://mlflow.org/docs/latest/ml/mlflow-3/
- MLflow Tracking: https://mlflow.org/docs/latest/ml/tracking/
- MLflow Model Registry: https://mlflow.org/docs/latest/ml/model-registry/workflow/
- MLflow serving local: https://mlflow.org/docs/latest/ml/deployment/deploy-model-locally/
- scikit-learn, armadilhas comuns: https://scikit-learn.org/stable/common_pitfalls.html
- Google, *Rules of ML*: https://developers.google.com/machine-learning/guides/rules-of-ml
- Evidently, métodos de drift: https://docs.evidentlyai.com/metrics/explainer_drift
- Kubeflow Pipelines: https://www.kubeflow.org/docs/components/pipelines/getting-started/
- KServe sklearn: https://kserve.github.io/website/docs/model-serving/predictive-inference/frameworks/sklearn
- OpenShift AI 3.5, MLflow: https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/working_with_mlflow/index
- OpenShift AI 3.5, AI Pipelines: https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/working_with_ai_pipelines/index
- OpenShift AI 3.5, deploy de modelos: https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/deploying_models/index
- DVC (versionamento de dados): https://dvc.org/doc

## Cursos gratuitos

- DeepLearning.AI + Red Hat, *Fast & Efficient LLM Inference with vLLM* (anúncio com o link; a página do curso deu erro 500 em 2026-10-13): https://developers.redhat.com/blog/2026/06/03/learn-optimize-deploy-and-benchmark-llms-vllm-new-free-course
- Red Hat, trilha *Get started with vLLM* (no Developer Sandbox): https://developers.redhat.com/learn/openshift-ai
- Evidently AI, cursos de avaliação de LLM: https://www.evidentlyai.com/courses
- Made With ML: https://madewithml.com/
- MLOps Zoomcamp (DataTalksClub, no seu ritmo): https://github.com/DataTalksClub/mlops-zoomcamp
- Full Stack Deep Learning 2022: https://fullstackdeeplearning.com/course/2022/
- MLOps Coding Course: https://mlops-coding-course.fmind.dev/

<!-- consolidado-modulos -->
## Módulos da pós

Fontes principais de cada módulo (a lista completa está nos docs de cada módulo).

### [Módulo 01 · Fundamentos de IA e LLMs](../modulos/01-fundamentos-ia-llms/)

- https://js.tensorflow.org/api/latest/
- https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/web_js
- https://arxiv.org/abs/1706.03762
- https://github.com/pgvector/pgvector
- https://openrouter.ai/docs/quickstart
- https://github.com/microsoft/playwright-mcp
- https://platform.openai.com/docs/guides/prompt-engineering

### [Módulo 02 · APIs de IA Generativa](../modulos/02-apis-ia-generativa/)

- https://platform.openai.com/docs/guides/prompt-caching
- https://platform.openai.com/docs/guides/images-vision
- https://platform.openai.com/docs/guides/speech-to-text
- https://ai.google.dev/gemini-api/docs/vision
- https://docs.ollama.com/api/openai-compatibility
- https://docs.langchain.com/oss/javascript/langchain/rag
- https://github.com/naptha/tesseract.js
- https://huggingface.co/docs/transformers.js/index

### [Módulo 03 · MCP](../modulos/03-mcp/)

- https://modelcontextprotocol.io/docs/getting-started/intro
- https://modelcontextprotocol.io/specification/2025-11-25
- https://github.com/modelcontextprotocol/typescript-sdk
- https://github.com/modelcontextprotocol/inspector
- https://owasp.org/www-project-top-10-for-large-language-model-applications/

### [Módulo 04 · Agentes Autônomos](../modulos/04-agentes-autonomos/)

- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://docs.langchain.com/oss/javascript/langgraph/overview
- https://platform.openai.com/docs/guides/function-calling
- https://arxiv.org/abs/2210.03629
- https://arxiv.org/abs/2305.18323
- https://genai.owasp.org/llmrisk/llm062025-excessive-agency/

### [Módulo 05 · IA para UX & UI](../modulos/05-ia-ux-ui/)

- https://modelcontextprotocol.io/extensions/apps/overview
- https://mcpui.dev
- https://github.com/dequelabs/axe-core-npm
- https://geminicli.com/docs/
- https://firebase.google.com/docs/studio
- https://firebase.google.com/docs/ai-logic
- https://www.w3.org/TR/WCAG21/

### [Módulo 06 · IA para DevOps](../modulos/06-ia-devops/)

- https://opentofu.org/docs/cli/commands/
- https://www.conftest.dev/
- https://www.openpolicyagent.org/docs/policy-language
- https://trivy.dev/latest/docs/
- https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/
- https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html
- https://sre.google/sre-book/postmortem-culture/

### [Módulo 07 · IA para Gestão de Projetos](../modulos/07-ia-gestao-de-projetos/)

- https://platform.openai.com/docs/guides/structured-outputs
- https://docs.ollama.com/capabilities/structured-outputs
- https://framework.scaledagile.com/wsjf
- https://datatracker.ietf.org/doc/html/rfc5545
- https://developer.atlassian.com/cloud/trello/rest/api-group-cards/
- https://adr.github.io/

### [Módulo 08 · Arquitetura de Sistemas com IA](../modulos/08-arquitetura-de-sistemas-com-ia/)

- https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns
- https://www.postgresql.org/docs/18/textsearch.html
- https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
- https://opentelemetry.io/docs/specs/semconv/gen-ai/
- https://www.w3.org/TR/trace-context/
- https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/generative-ai-lens.html

### [Módulo 09 · Dados e Fine-Tuning](../modulos/09-dados-e-fine-tuning/)

- https://developers.openai.com/api/docs/guides/supervised-fine-tuning
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning
- https://huggingface.co/docs/peft/main/en/conceptual_guides/lora
- https://arxiv.org/abs/2106.09685
- https://github.com/ollama/ollama/pull/14969
- https://cookbook.openai.com/examples/chat_finetuning_data_prep

### [Módulo 10 · Segurança e Governança](../modulos/10-seguranca-e-governanca/)

- https://www.nist.gov/itl/ai-risk-management-framework
- https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai
- https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2487262
- https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- https://genai.owasp.org/llm-top-10/
- https://scikit-learn.org/stable/modules/permutation_importance.html
- https://fairlearn.org/
- https://arxiv.org/abs/1810.03993

### [Módulo 11 · Capstone Micro-SaaS](../modulos/11-capstone-micro-saas/)

- https://google.github.io/adk-docs/
- https://github.com/google/adk-js
- https://angular.dev/reference/versions
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://github.com/fastify/fastify-swagger
- https://docs.docker.com/compose/how-tos/networking/

### [Módulo 12 · Carreira](../modulos/12-carreira/)

- https://dropbox.github.io/dbx-career-framework/
- https://staffeng.com/guides/staff-archetypes/
- https://jvns.ca/blog/brag-documents/
- https://www.techinterviewhandbook.org/behavioral-interview/
- https://github.com/donnemartin/system-design-primer
- https://www.anthropic.com/engineering/building-effective-agents
