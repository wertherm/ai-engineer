# Trilha extra · LLMOps com vLLM e OpenShift

Servir um LLM com o **vLLM** em CPU, operar como **LLMOps** (avaliar, medir latência e custo, promover com
portão) e levar para **Kubernetes/OpenShift**. Complementa os módulos 2, 4 e 8 da pós.

> **Todos os comandos desta trilha partem desta pasta** (`trilhas-extras/llmops-vllm-openshift/`).
> Instalação: [infra/instalacao.md](../../infra/instalacao.md).

## Versão estudada

vLLM 0.31.0 (imagem `vllm/vllm-openai-cpu:v0.31.0-x86_64`) · Qwen2.5-0.5B-Instruct · Prometheus 3.15 ·
OpenShift 4.22 / OpenShift AI 3.5 (documentação) · kubectl 1.37 · kind 0.33 · `oc` 4.22. Verificado em 2026-10-13.

## Trilha

| # | Tópico | Doc | Exemplo | Exercício |
|---|---|---|---|---|
| 1 | LLMOps, vLLM e OpenShift | [01-visao-geral](docs/01-visao-geral.md) | — | — |
| 2 | Primeira chamada (API OpenAI-compatível) | [03-vllm-servindo-modelos](docs/03-vllm-servindo-modelos.md) | [01-primeira-chamada](exemplos/01-primeira-chamada/) | — |
| 3 | Tokens e sampling | [02-fundamentos-de-llm](docs/02-fundamentos-de-llm.md) | [02-tokens-e-sampling](exemplos/02-tokens-e-sampling/) | [01-classificador](exercicios/01-classificador-de-sentimento/) |
| 4 | Streaming, TTFT e ITL | [02-fundamentos-de-llm](docs/02-fundamentos-de-llm.md) | [03-streaming-ttft-itl](exemplos/03-streaming-ttft-itl/) | — |
| 5 | Métricas Prometheus | [04-metricas-e-observabilidade](docs/04-metricas-e-observabilidade.md) | [04-metricas-prometheus](exemplos/04-metricas-prometheus/) | [02-alerta-de-slo](exercicios/02-alerta-de-slo/) |
| 6 | Avaliação como regressão | [05-avaliacao](docs/05-avaliacao.md) | [05-avaliacao-com-pytest](exemplos/05-avaliacao-com-pytest/) | [01-classificador](exercicios/01-classificador-de-sentimento/) |
| 7 | Carga, batching e custo | [08-custo-e-capacidade](docs/08-custo-e-capacidade.md) | [06-carga-e-custo](exemplos/06-carga-e-custo/) | — |
| 8 | Kubernetes e OpenShift | [06-kubernetes-e-openshift](docs/06-kubernetes-e-openshift.md) | [07-vllm-no-kubernetes](exemplos/07-vllm-no-kubernetes/) | [03-imagem-sem-root](exercicios/03-imagem-sem-root/) |
| 9 | vLLM no OpenShift / OpenShift AI | [07-vllm-no-openshift](docs/07-vllm-no-openshift.md) | [07-vllm-no-kubernetes/openshift](exemplos/07-vllm-no-kubernetes/openshift/) | — |
| 🏁 | Projeto final: portão de promoção LLMOps | todos | [projeto-final](projeto-final/) | — |

## Como rodar

```bash
cd trilhas-extras/llmops-vllm-openshift
bash ../../infra/subir-vllm.sh                          # ~4 min: subida + aquecimento
uv run python exemplos/01-primeira-chamada/chamada.py
uv run pytest exemplos/05-avaliacao-com-pytest -v
bash ../../infra/parar-vllm.sh                          # libera ~6 GB de RAM
```

## Status de verificação

| Item | Status |
|---|---|
| Exemplos 01–06 | ✅ executados contra o vLLM 0.31.0 em CPU |
| Exemplo 07, `k8s/` | ✅ executado no kind |
| Exemplo 07, `openshift/` | ⚠️ Deployment/Service/PVC executados no kind em modo `restricted`; Route e ServiceMonitor **não executados localmente** |
| Exercícios 01–03 e projeto final | ✅ executados |
| OpenShift AI (KServe, llm-d) em [docs/07](docs/07-vllm-no-openshift.md) | ⚠️ não executado localmente |
