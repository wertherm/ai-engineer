# 02 · Instalação (Linux, sem GPU)

## Objetivo

Deixar a máquina pronta para rodar **todos** os exemplos: vLLM em CPU, cliente Python, kind, kubectl e `oc`.

Versões verificadas em 2026-10-13 neste repositório:

| Ferramenta | Versão | Para quê |
|---|---|---|
| Ollama + modelos | 0.40.5 · `qwen3.5:4b` · `qwen3-embedding:0.6b` | LLM local dos módulos da pós |
| Postgres + pgvector | 18 · 0.8.7 | RAG, memória de agentes, cache semântico |
| Node.js / npm | 24.11 / 11.6 | exemplos em JavaScript/TypeScript dos módulos |
| Docker | 29.5 | rodar o vLLM e o kind |
| imagem `vllm/vllm-openai-cpu` | `v0.31.0-x86_64` | o servidor de inferência (6,7 GB descompactada) |
| modelo `Qwen/Qwen2.5-0.5B-Instruct` | — | ~1 GB, sem *gated access* no Hugging Face |
| uv + Python | 0.12 / 3.14 (fixado em `.python-version`; o uv baixa sozinho) | os exemplos em Python |
| kubectl | v1.37.1 | cliente Kubernetes |
| kind | v0.33.0 | cluster Kubernetes dentro do Docker |
| oc | 4.22.17 | cliente OpenShift (também fala com o kind) |
| MLflow / scikit-learn | 3.17.1 / 1.9.1 | trilha de MLOps (trilhas-extras/mlops) |
| kfp (grupo `kfp` do uv) | 2.17.0 | pipelines Kubeflow (trilhas-extras/mlops, exemplo 05) |

## Requisitos da máquina

- x86_64 com **AVX-512** (recomendado) ou AVX2 (funciona com recursos limitados). Confira com
  `grep -o -m1 'avx512f\|avx2' /proc/cpuinfo`.
- ~8 GB de RAM livres (o vLLM com este modelo usa ~6 GB) e ~15 GB de disco.
- **Sem GPU.** Tudo aqui roda em CPU; o mesmo código funciona igual numa GPU, só mais rápido.

## 0. Ollama + Postgres/pgvector (módulos da pós)

Os módulos em `modulos/` usam um LLM local via **Ollama** (API compatível com OpenAI) e um banco vetorial
**Postgres 18 + pgvector 0.8.7**, os dois em Docker, sem sudo. Versões verificadas em 2026-10-16:

| Serviço | Imagem | Porta | Modelos |
|---|---|---|---|
| Ollama 0.40.5 | `ollama/ollama:0.40.5` | 11434 | `qwen3.5:4b` (chat, tools e visão; 3,3 GB) · `qwen3-embedding:0.6b` (1024 dim.; 639 MB) |
| Postgres + pgvector | `pgvector/pgvector:0.8.7-pg18` | **5433** (a 5432 costuma ter um Postgres local) | — |

```bash
bash infra/subir-ia.sh          # 1ª vez: ~3 min e ~4 GB de download; depois, segundos
cp infra/.env.example .env      # opcional: as variáveis já têm esses valores como padrão no código
bash infra/parar-ia.sh          # para os containers; modelos e dados ficam nos volumes
```

- **Thinking**: o `qwen3.5:4b` "pensa" antes de responder por padrão. Os exemplos mandam `reasoning_effort: "none"`.
- **Velocidade em CPU**: ~5 tokens/s no chat (≈14 s para uma resposta curta), ~1 s por lote de embeddings.
- **`tool_choice` não é suportado** pelo Ollama: o modelo decide sozinho se chama uma tool.
- **Memória**: os dois modelos carregados somam ~4,3 GB (`docker compose exec ollama ollama ps`), mas o container
  chegou a ~7,7 GB no `docker stats` (o contexto já é 4096 e há 1 slot; o excedente parece ser cache dos arquivos
  dos modelos). Os modelos saem da RAM 30 min após o último uso (`OLLAMA_KEEP_ALIVE`); para liberar na hora,
  `bash infra/parar-ia.sh`.
- **Vários processos no mesmo Ollama** formam fila: com 4 clientes simultâneos, chamadas curtas levaram de
  minutos a mais de 1 hora de relógio. Rode um módulo por vez.
- **Trocar para a OpenAI ou o OpenRouter** é só mudar `OPENAI_BASE_URL`, `OPENAI_API_KEY` e `MODELO_CHAT` (veja `infra/.env.example`).

## 1. vLLM em CPU (Docker)

A forma mais simples. A doc oficial também oferece a *wheel* `+cpu` via `uv pip`, mas ela exige
configurar `LD_PRELOAD` com a Intel OpenMP. O Docker evita isso.

```bash
docker pull vllm/vllm-openai-cpu:v0.31.0-x86_64
bash infra/subir-vllm.sh        # sobe, espera o /health e faz o aquecimento
curl -s localhost:8000/version    # {"version":"0.31.0"}
```

A **primeira** subida baixa o modelo para `~/.cache/huggingface` e a primeira requisição compila kernels
(~2 min). Depois disso, cada resposta curta leva cerca de 1 s.

Para parar: `bash infra/parar-vllm.sh`.

## 2. Cliente Python

```bash
uv sync                                   # cria .venv com openai, httpx, pyyaml e pytest
uv run python exemplos/01-primeira-chamada/chamada.py
```

## 2b. MLOps (MLflow, scikit-learn, Kubeflow Pipelines)

Já vêm no `uv sync`. O SDK do Kubeflow Pipelines fica num grupo à parte, porque só o exemplo 05 da trilha de MLOps usa:

```bash
uv run python -c "import mlflow, sklearn; print(mlflow.__version__, sklearn.__version__)"   # 3.17.1 1.9.1
uv run --group kfp python -c "import kfp; print(kfp.__version__)"                          # 2.17.0
export MLFLOW_DISABLE_AGENT_HINT=1   # o MLflow 3.17 imprime uma dica para agentes de IA em todo comando
```

O tracking usa `mlflow.db` (SQLite) na raiz do repo; os modelos ficam em `mlartifacts/`. Os dois estão no
`.gitignore`. Para recomeçar do zero: `rm -rf mlflow.db mlartifacts`.

## 3. kind, kubectl e oc (sem sudo, em ~/.local/bin)

Sempre confira o checksum do binário baixado:

```bash
cd "$(mktemp -d)"
# kubectl (versão estável atual em https://dl.k8s.io/release/stable.txt)
curl -fsSLO https://dl.k8s.io/release/v1.37.1/bin/linux/amd64/kubectl
curl -fsSL https://dl.k8s.io/release/v1.37.1/bin/linux/amd64/kubectl.sha256 | sed 's/$/  kubectl/' | sha256sum -c
# kind
curl -fsSLo kind https://kind.sigs.k8s.io/dl/v0.33.0/kind-linux-amd64
curl -fsSL https://kind.sigs.k8s.io/dl/v0.33.0/kind-linux-amd64.sha256sum | awk '{print $1"  kind"}' | sha256sum -c
# oc (mirror oficial da Red Hat; o tar traz oc e kubectl)
curl -fsSLo oc.tgz https://mirror.openshift.com/pub/openshift-v4/clients/ocp/stable/openshift-client-linux.tar.gz
tar -xzf oc.tgz oc
install -m755 kubectl kind oc ~/.local/bin/
kubectl version --client; kind version; oc version --client
```

## 4. Um OpenShift de verdade (opcional)

Não cabe nesta máquina rodar OpenShift e vLLM juntos. Opções gratuitas:

| Opção | Requisitos | Observações |
|---|---|---|
| **Developer Sandbox** (recomendado) | conta Red Hat + telefone | 30 dias renováveis; pods morrem após 12 h; inclui OpenShift AI |
| OpenShift Local (CRC 2.64), preset `openshift` | 4 núcleos, **10,5 GB livres**, 35 GB, pull secret | Ubuntu não é suportado oficialmente; monitoramento pede ~14 GB |
| OpenShift Local, preset `microshift` | 2 núcleos, 4 GB | sem console web, sem BuildConfig, sem OperatorHub |

```bash
# OpenShift Local (se for tentar): baixe crc e o pull secret em https://console.redhat.com/openshift/create/local
crc setup && crc config set preset microshift && crc start && eval $(crc oc-env)
```

## Armadilhas

- **`pip install vllm` numa máquina sem GPU** instala o build CUDA e falha com
  `RuntimeError: Failed to infer device type`. Use a imagem `-cpu` ou a wheel `+cpu`.
- **`--dtype float16` em CPU** é instável: use `bfloat16`.
- **Sem `--cap-add SYS_NICE --security-opt seccomp=unconfined`** o vLLM avisa
  `get_mempolicy: Operation not permitted` e perde desempenho.
- **A primeira requisição demora ~2 min** (compilação). Não é travamento: o `subir-vllm.sh` já faz o aquecimento.

## Fontes

- MLflow, instalação e quickstart: https://mlflow.org/docs/latest/ml/getting-started/quickstart/
- Instalação do vLLM em CPU: https://docs.vllm.ai/en/latest/getting_started/installation/cpu.html
- Tags da imagem: https://hub.docker.com/r/vllm/vllm-openai-cpu/tags
- kubectl: https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/
- kind: https://kind.sigs.k8s.io/docs/user/quick-start/
- CLI `oc`: https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/cli_tools/openshift-cli-oc
- OpenShift Local: https://crc.dev/docs/installing/
- Developer Sandbox: https://developers.redhat.com/developer-sandbox
