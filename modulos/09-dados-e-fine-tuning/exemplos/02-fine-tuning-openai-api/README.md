# Exemplo 02 · Fine-tuning via OpenAI API (upload, job, monitoramento) em JavaScript

**Conceito novo:** automatizar o ciclo de fine-tuning de uma API comercial com o SDK `openai` — validação,
estimativa de custo, upload (`files.create`, purpose `fine-tune`), job (`fineTuning.jobs.create`, método
`supervised`), polling de status e eventos de métricas, checkpoints e registro da versão do modelo.

**Pré-requisito:** [exemplo 01](../01-preparacao-de-dataset/) (gera `dados/treino.jsonl`). Teoria em
[docs/03](../../docs/03-fine-tuning-em-apis-comerciais.md).

| Arquivo | Status |
|---|---|
| `estimar-custo.js` — tokens (js-tiktoken, `o200k_base`) × preços oficiais de 2026-10-16 | ✅ executado |
| `fine-tune-openai.js` modo `--dry-run` (padrão) — valida e mostra o payload | ✅ executado |
| `fine-tune-openai.js --executar` contra a **OpenAI real** | ⚠️ **não executado localmente**: exige `OPENAI_API_KEY` de conta paga com acesso ao fine-tuning (a OpenAI fechou a plataforma para novos usuários) |
| `fine-tune-openai.js --executar` contra `mock-openai.js` (mock local dos endpoints) | ✅ executado — prova o fluxo do script, **não** treina nada |

## Como rodar

```bash
cd modulos/09-dados-e-fine-tuning
npm run ex02:custo                 # estimativa (3 épocas, 100 mil tickets/mês)
npm run ex02:openai                # dry-run: nada é enviado

# fluxo completo contra o mock local (porta 30901)
node exemplos/02-fine-tuning-openai-api/mock-openai.js &   # anote o PID
OPENAI_BASE_URL=http://localhost:30901/v1 OPENAI_API_KEY=sk-mock POLL_MS=200 \
  node exemplos/02-fine-tuning-openai-api/fine-tune-openai.js --executar
kill <PID>

# de verdade (não executado aqui):
# OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=sk-... npm run ex02:openai -- --executar
```

## Saída esperada

```text
$ npm run ex02:custo
Treino: 178 exemplos, 11843 tokens · Validação: 46 exemplos, 3038 tokens
Tokens treinados (cobrados) = 11843 × 3 épocas = 35529
Input por chamada: fine-tunado ~59 tokens · genérico few-shot (20 exemplos) ~552 tokens

│ modelo                    │ treino       │ ft 100000/mês │ base few-shot 100000/mês │ economia/mês │
│ 'gpt-4.1-2025-04-14'      │ 'US$ 0.8882' │ 'US$ 21.40'   │ 'US$ 112.86'             │ 'US$ 91.47'  │
│ 'gpt-4.1-mini-2025-04-14' │ 'US$ 0.1776' │ 'US$ 5.71'    │ 'US$ 22.57'              │ 'US$ 16.87'  │
│ 'gpt-4.1-nano-2025-04-14' │ 'US$ 0.0533' │ 'US$ 1.43'    │ 'US$ 5.64'               │ 'US$ 4.22'   │
Obs.: estimativa. O valor real vem em `trained_tokens` do job; a validação NÃO é cobrada como treino.

$ npm run ex02:openai
validação treino.jsonl: 178 exemplos, ~11843 tokens, 0 erro(s)
validação validacao.jsonl: 46 exemplos, ~3038 tokens, 0 erro(s)

[dry-run] nada foi enviado. Payload que seria usado em client.fineTuning.jobs.create():
{
  "model": "gpt-4.1-nano-2025-04-14",
  ...
  "suffix": "suporte-676666",
  "seed": 42,
  "method": { "type": "supervised", "supervised": { "hyperparameters": { "n_epochs": 3, "batch_size": "auto", "learning_rate_multiplier": "auto" } } },
  "metadata": { "dataset_sha256": "676666eb7301", "projeto": "triagem-tickets" }
}

$ (contra o mock) fine-tune-openai.js --executar
upload ok: treino=file-mock1 validação=file-mock2
job criado: ftjob-mock1 (status validating_files)
[2026-10-16T20:27:50.000Z] info Etapa: queued
status=validating_files trained_tokens=-
[2026-10-16T20:27:50.000Z] info Step 20/66 {"step":20,"train_loss":1}
...
status=succeeded trained_tokens=35529
checkpoint passo 22: ft:gpt-4.1-nano-2025-04-14:mock:suporte:abc123:ckpt-step-22 {"full_valid_loss":0.5}
...
modelo pronto: ft:gpt-4.1-nano-2025-04-14:mock:suporte:abc123 (registrado em dados/registro-modelos.mock.jsonl)
```

## Experimente

1. `node exemplos/02-fine-tuning-openai-api/estimar-custo.js 6 1000000` — 6 épocas e 1 milhão de tickets/mês.
2. Troque o modelo com `MODELO_BASE_FT=gpt-4.1-mini-2025-04-14 npm run ex02:openai` e veja o payload.
3. Recalcule a coluna "base few-shot" considerando cache de prompt (input em cache custa 1/4): a vantagem do fine-tuning diminui.

## Versão Python

Em [`python/`](python/): `estimar_custo.py` (`tiktoken` com o mesmo `o200k_base` do `js-tiktoken`: as contagens
batem token a token), `fine_tune_openai.py` (SDK `openai` Python: `client.files.create(file=Path, purpose="fine-tune")`,
`client.fine_tuning.jobs.create(..., method={...})`, `retrieve`, `list_events`, `checkpoints.list`) e
`mock_openai.py` (FastAPI, porta 30951, mesmo comportamento do `mock-openai.js`).

| Arquivo | Status |
|---|---|
| `estimar_custo.py` | ✅ executado — mesmos números do JS |
| `fine_tune_openai.py` dry-run | ✅ executado — mesmo payload e hash `676666eb7301` |
| `fine_tune_openai.py --executar` contra o mock FastAPI **e** contra o `mock-openai.js` | ✅ executado (não treina) |
| `fine_tune_openai.py --executar` contra a **OpenAI real** | ⚠️ **não executado localmente** — mesmo motivo do JS (chave de conta paga com acesso ao fine-tuning) |

**Como rodar** (da pasta do módulo):

```bash
uv run python exemplos/02-fine-tuning-openai-api/python/estimar_custo.py
uv run python exemplos/02-fine-tuning-openai-api/python/fine_tune_openai.py          # dry-run

uv run python exemplos/02-fine-tuning-openai-api/python/mock_openai.py &             # porta 30951; anote o PID
OPENAI_BASE_URL=http://localhost:30951/v1 OPENAI_API_KEY=sk-mock POLL_MS=200 \
  uv run python exemplos/02-fine-tuning-openai-api/python/fine_tune_openai.py --executar
kill <PID>
# o mesmo script contra o mock do JS: PORTA=30952 node exemplos/02-fine-tuning-openai-api/mock-openai.js &
```

**Saída esperada (Python)** — saída real:

```text
$ estimar_custo.py
Treino: 178 exemplos, 11843 tokens · Validação: 46 exemplos, 3038 tokens
Tokens treinados (cobrados) = 11843 × 3 épocas = 35529
Input por chamada: fine-tunado ~59 tokens · genérico few-shot (20 exemplos) ~552 tokens

┌─────────────────────────┬────────────┬───────────────┬──────────────────────────┬──────────────┐
│ modelo                  │ treino     │ ft 100000/mês │ base few-shot 100000/mês │ economia/mês │
├─────────────────────────┼────────────┼───────────────┼──────────────────────────┼──────────────┤
│ gpt-4.1-2025-04-14      │ US$ 0.8882 │ US$ 21.40     │ US$ 112.86               │ US$ 91.47    │
│ gpt-4.1-mini-2025-04-14 │ US$ 0.1776 │ US$ 5.71      │ US$ 22.57                │ US$ 16.87    │
│ gpt-4.1-nano-2025-04-14 │ US$ 0.0533 │ US$ 1.43      │ US$ 5.64                 │ US$ 4.22     │
└─────────────────────────┴────────────┴───────────────┴──────────────────────────┴──────────────┘

$ fine_tune_openai.py
validação treino.jsonl: 178 exemplos, ~11843 tokens, 0 erro(s)
validação validacao.jsonl: 46 exemplos, ~3038 tokens, 0 erro(s)
[dry-run] nada foi enviado. Payload que seria usado em client.fine_tuning.jobs.create():
  ... "suffix": "suporte-676666", ... "dataset_sha256": "676666eb7301" ...

$ (contra o mock FastAPI) fine_tune_openai.py --executar
upload ok: treino=file-mock1 validação=file-mock2
job criado: ftjob-mock1 (status validating_files)
[2026-10-17T23:20:39.000Z] info Etapa: queued
status=validating_files trained_tokens=-
[2026-10-17T23:20:40.000Z] info Etapa: running
[2026-10-17T23:20:40.000Z] info Step 20/66 {"step":20,"train_loss":1}
...
status=succeeded trained_tokens=35529
checkpoint passo 22: ft:gpt-4.1-nano-2025-04-14:mock:suporte:abc123:ckpt-step-22 {"full_valid_loss":0.5}
checkpoint passo 44: ft:gpt-4.1-nano-2025-04-14:mock:suporte:abc123:ckpt-step-44 {"full_valid_loss":0.25}
checkpoint passo 66: ft:gpt-4.1-nano-2025-04-14:mock:suporte:abc123:ckpt-step-66 {"full_valid_loss":0.167}

modelo pronto: ft:gpt-4.1-nano-2025-04-14:mock:suporte:abc123 (registrado em dados/registro-modelos.mock.jsonl)
```

Contra o `mock-openai.js` a saída é a mesma; e o `fine-tune-openai.js` também roda contra o `mock_openai.py`.
