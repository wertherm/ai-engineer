# Módulo 09 · Processamento de Dados e Fine-Tuning de Modelos

Quando vale a pena ajustar um modelo, como preparar o dataset (em JavaScript), como automatizar o fine-tuning
numa API comercial, como fazer um **LoRA de verdade em CPU** e como avaliar e integrar o modelo customizado
num fluxo de atendimento — com um domínio só do começo ao fim: triagem de tickets de suporte (dados sintéticos).

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| **U1 · Quando fazer fine-tuning (decision framework)** | |
| · Prompt × RAG × fine-tuning × modelo maior; custo, dados necessários, manutenção | [doc 01](docs/01-decision-framework.md) · [exercício 02](exercicios/02-decision-framework/) · [exemplo 02](exemplos/02-fine-tuning-openai-api/) (custo) |
| **U2 · Preparação de datasets** | |
| · Identificar e coletar dados relevantes | [doc 02](docs/02-preparacao-de-datasets.md) · [exemplo 01](exemplos/01-preparacao-de-dataset/) (`gerar-brutos.js`, dados sintéticos) |
| · Limpeza, balanceamento e padronização de texto | [doc 02](docs/02-preparacao-de-datasets.md) · [exemplo 01](exemplos/01-preparacao-de-dataset/) |
| · Estruturar em JSONL no formato das APIs de fine-tuning | [exemplo 01](exemplos/01-preparacao-de-dataset/) (`preparar.js`, `validar-jsonl.js`) |
| · Automatizar a preparação com scripts em JavaScript | [exemplo 01](exemplos/01-preparacao-de-dataset/) (+ testes `npm test`) |
| · Qualidade e diversidade dos dados | [doc 02](docs/02-preparacao-de-datasets.md) · relatório do [exemplo 01](exemplos/01-preparacao-de-dataset/) · [exercício 01](exercicios/01-melhorar-dataset/) |
| **U3 · Fine-tuning via OpenAI API** | |
| · O processo em APIs comerciais (OpenAI, Gemini) | [doc 03](docs/03-fine-tuning-em-apis-comerciais.md) — **não executado localmente** (conta paga) |
| · Upload do dataset e acompanhamento do treino | [exemplo 02](exemplos/02-fine-tuning-openai-api/) — OpenAI real **não executado localmente**; fluxo testado contra mock local |
| · Hiperparâmetros básicos e monitoramento | [doc 03](docs/03-fine-tuning-em-apis-comerciais.md) · [exemplo 02](exemplos/02-fine-tuning-openai-api/) · [exemplo 03](exemplos/03-lora-peft-cpu/) (loss real) |
| · Scripts em JS para automação de upload e acompanhamento | [exemplo 02](exemplos/02-fine-tuning-openai-api/) (`fine-tune-openai.js`) |
| · Versionamento e documentação de modelos fine-tunados | [doc 03](docs/03-fine-tuning-em-apis-comerciais.md) · `dados/registro-modelos.jsonl` do [exemplo 02](exemplos/02-fine-tuning-openai-api/) · [trilha MLOps](../../trilhas-extras/mlops/) |
| **U4 · LoRA e PEFT** | |
| · Princípios; fine-tuning leve para reduzir custo | [doc 04](docs/04-lora-peft-e-avaliacao.md) · [exemplo 03](exemplos/03-lora-peft-cpu/) |
| · Trade-offs desempenho × eficiência; full fine-tuning × LoRA | [doc 04](docs/04-lora-peft-e-avaliacao.md) (tabela com números medidos) · [exemplo 03](exemplos/03-lora-peft-cpu/) |
| · Demos com "camadas adaptativas" consumidas em JS | [exemplo 04](exemplos/04-avaliacao-ab/) (adapter servido por API OpenAI-compatível, consumido pelo SDK JS); Ollama `ADAPTER` em [doc 04](docs/04-lora-peft-e-avaliacao.md) — removido do Ollama em set/2026, **não executado** |
| **U5 · Avaliar modelos fine-tunados** | |
| · Métricas qualitativas e quantitativas; precisão, consistência, adequação | [doc 04](docs/04-lora-peft-e-avaliacao.md) · [exemplo 04](exemplos/04-avaliacao-ab/) |
| · Testes A/B entre customizado e genérico | [exemplo 04](exemplos/04-avaliacao-ab/) |
| · Scripts JS de automação de testes e logging de resultados | [exemplo 04](exemplos/04-avaliacao-ab/) (`avaliar.js` → JSONL + CSV) |
| · Overfitting e perda de generalização | [doc 04](docs/04-lora-peft-e-avaliacao.md) · [exemplo 04](exemplos/04-avaliacao-ab/) (perguntas fora do domínio) · [exercício 01](exercicios/01-melhorar-dataset/) |
| **U6 · Projeto final: modelo customizado num fluxo (chatbot/agente) via API em JS** | [exemplo 05](exemplos/05-projeto-final-triagem/) (dados → ajuste → avaliação → agente + Postgres) |

## Pré-requisitos

- Infra do repositório no ar, a partir da **raiz**: `bash infra/subir-ia.sh` (Ollama `qwen3.5:4b` e Postgres;
  só o exemplo 05 usa os dois).
- Node 24 + npm 11: `npm install` na pasta do módulo (openai, js-tiktoken, pg, undici; ~15 MB).
- Python 3.14 + uv: `uv sync` na pasta do módulo — usa o **[`pyproject.toml` próprio](pyproject.toml)** (não o da
  raiz), com o torch do **índice de CPU do PyTorch** (sem baixar CUDA). `.venv` ~1,2 GB.
- Na 1ª execução Python baixa o `HuggingFaceTB/SmolLM2-135M-Instruct` (Apache-2.0, ~270 MB) para
  `.venv/huggingface/` **dentro do módulo** (ignorado pelo git).
- RAM: o treino LoRA chega a ~3,9 GB de pico; o servidor do exemplo 04 usa ~1 GB.
- Variáveis (opcionais, defaults locais): `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODELO_CHAT`, `DATABASE_URL`
  ([`infra/.env.example`](../../infra/.env.example)), `LORA_BASE_URL` (padrão `http://localhost:30900/v1`),
  `TORCH_THREADS` (padrão 4).

| Dependência | Versão |
|---|---|
| openai (npm) · js-tiktoken · pg · undici | 7.34.0 · 1.0.21 · 8.23.1 · 8.12.2 |
| torch (CPU, `+cpu`, wheel cp314) | 2.14.1 |
| transformers · peft · datasets | 5.20.1 · 0.21.2 · 5.1.0 |
| accelerate · safetensors | 1.15.0 · 0.8.0 |
| versão Python dos exemplos JS: openai · tiktoken · psycopg[binary] · fastapi · uvicorn · pytest | 3.33.0 · 0.14.0 · 3.3.6 · 0.143.3 · 0.54.0 · 9.1.1 |

- `uv` também roda a **versão Python** dos exemplos JS (pastas `python/` + [`comum_py/`](comum_py/)); o `tiktoken`
  guarda o `o200k_base` em `.venv/tiktoken/`.

## Como rodar

```bash
cd modulos/09-dados-e-fine-tuning
npm install && uv sync

# U2 · dataset
npm run ex01:brutos && npm run ex01 && npm run ex01:validar && npm test
# U3 · API comercial (custo + dry-run; o real exige conta OpenAI)
npm run ex02:custo && npm run ex02:openai
# U4 · LoRA em CPU (~2–9 min)
uv run python exemplos/03-lora-peft-cpu/treinar_lora.py
# U5 · A/B (servidor na porta 30900)
uv run python exemplos/04-avaliacao-ab/servidor_openai.py &   # anote o PID
node exemplos/04-avaliacao-ab/avaliar.js
# U6 · projeto final (com o servidor ainda no ar)
node exemplos/05-projeto-final-triagem/agente.js
kill <PID>

# exercícios
uv run python exercicios/01-melhorar-dataset/solucao/comparar.py
node exercicios/02-decision-framework/solucao/decidir.js
```

Versão Python dos exemplos JS (mesmo `uv sync`; o exemplo 01 grava em `dados/python/`, idêntico byte a byte a `dados/`):

```bash
uv run python exemplos/01-preparacao-de-dataset/python/gerar_brutos.py
uv run python exemplos/01-preparacao-de-dataset/python/preparar.py
uv run python exemplos/01-preparacao-de-dataset/python/validar_jsonl.py dados/python/treino.jsonl dados/python/validacao.jsonl
uv run pytest
uv run python exemplos/02-fine-tuning-openai-api/python/estimar_custo.py
uv run python exemplos/02-fine-tuning-openai-api/python/fine_tune_openai.py            # dry-run
uv run python exemplos/02-fine-tuning-openai-api/python/mock_openai.py &               # porta 30951; anote o PID
OPENAI_BASE_URL=http://localhost:30951/v1 OPENAI_API_KEY=sk-mock POLL_MS=200 \
  uv run python exemplos/02-fine-tuning-openai-api/python/fine_tune_openai.py --executar
kill <PID>
uv run python exemplos/04-avaliacao-ab/servidor_openai.py &                            # anote o PID
uv run python exemplos/04-avaliacao-ab/python/avaliar.py
uv run python exemplos/05-projeto-final-triagem/python/agente.py                       # grava em m09.atendimentos_py
kill <PID>
uv run python exercicios/02-decision-framework/solucao/python/decidir.py
```

## Status de verificação

Executado em 2026-10-16/17, CPU de 8 núcleos sem GPU, ~2–4 GB de RAM livres, Ollama disputado por outros processos.

| Item | Status |
|---|---|
| Exemplo 01 · geração, preparação, validador, 5 testes | ✅ executado |
| Exemplo 02 · estimativa de tokens/custo e dry-run | ✅ executado |
| Exemplo 02 · fluxo upload → job → polling → checkpoints contra mock local | ✅ executado (não treina) |
| Exemplo 02 · fine-tuning na OpenAI real | ⚠️ não executado localmente — exige chave de conta paga; a OpenAI fechou o fine-tuning para novos usuários |
| Gemini (Vertex AI) SFT | ⚠️ não executado localmente — exige projeto GCP com faturamento |
| Exemplo 03 · LoRA em CPU (0,69% treinável, loss val 5,09 → 0,25, adapter 3,7 MB) | ✅ executado |
| Exemplo 04 · A/B base × LoRA (acurácia 0% → 67,4%) + fora do domínio | ✅ executado |
| Exemplo 05 · agente (LoRA + qwen3.5:4b + Postgres m09) | ✅ executado (2 tickets) |
| Ollama `ADAPTER`/import do modelo fundido | ⚠️ não executado — `ADAPTER` removido do Ollama (PR #14969); import do modelo fundido não testado para não sobrecarregar o Ollama compartilhado |
| Exercício 01 · ruidoso × limpo (34,8% → 43,5%, 1 época cada) | ✅ executado (variantes em processos separados) |
| Exercício 02 · decision framework | ✅ executado |
| **Python** · exemplo 01 (gerador, preparação, validador, 7 testes pytest) | ✅ executado — 456 brutos → 178/46, arquivos idênticos aos do JS |
| **Python** · exemplo 02 (custo, dry-run, fluxo contra mock FastAPI e contra o mock JS) | ✅ executado — mesmos números do JS |
| **Python** · exemplo 02 contra a OpenAI real | ⚠️ não executado localmente — mesmo motivo do JS |
| **Python** · exemplo 03 e exercício 01 | ✅ já eram Python |
| **Python** · exemplo 04 (`avaliar.py`) | ✅ executado — acurácia LoRA 0,674, igual ao JS |
| **Python** · exemplo 05 (`agente.py`, `m09.atendimentos_py`) | ✅ executado (2 tickets) |
| **Python** · exercício 02 (`decidir.py`) | ✅ executado — saída idêntica à do JS |

## Fontes

- OpenAI · Supervised fine-tuning: https://developers.openai.com/api/docs/guides/supervised-fine-tuning
- OpenAI · Model optimization: https://developers.openai.com/api/docs/guides/model-optimization
- OpenAI · Pricing: https://developers.openai.com/api/docs/pricing
- Google Cloud · Gemini supervised tuning: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning
- Hugging Face PEFT · LoRA: https://huggingface.co/docs/peft/main/en/conceptual_guides/lora
- LoRA (Hu et al., 2021): https://arxiv.org/abs/2106.09685
- PyTorch · instalação CPU: https://pytorch.org/get-started/locally/
- Ollama · import: https://github.com/ollama/ollama/blob/main/docs/import.mdx
