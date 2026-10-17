# Exemplo 03 · LoRA/PEFT real em CPU (Python)

**Conceito novo:** fine-tuning leve com LoRA — congelar o modelo e treinar só matrizes de posto baixo nas
projeções de atenção; ver o % de parâmetros treináveis, a loss caindo e o tamanho do adapter.

**Por que Python:** o ecossistema de treino (PyTorch + Transformers + PEFT) é Python; o consumo continua em JS
pela API (exemplos 04 e 05). Teoria em [docs/04](../../docs/04-lora-peft-e-avaliacao.md).

**Pré-requisito:** [exemplo 01](../01-preparacao-de-dataset/) (dados) e `uv sync` na pasta do módulo (usa o
[`pyproject.toml` próprio do módulo](../../pyproject.toml), com torch do índice de CPU). Na 1ª execução baixa o
`HuggingFaceTB/SmolLM2-135M-Instruct` (Apache-2.0, ~270 MB, revisão fixa) para `.venv/huggingface/` do módulo.

**Recursos:** ~2,5 min com 4 threads e máquina livre (8,6 min com a CPU disputada); pico de RAM **~3,9 GB**
(medido com `/usr/bin/time -v`).

## Como rodar

```bash
cd modulos/09-dados-e-fine-tuning
uv sync
uv run python exemplos/03-lora-peft-cpu/treinar_lora.py            # 2 épocas, r=8, lr=1e-3
# variações: --epocas 1 --r 4 --lr 5e-4
```

Saída: `exemplos/03-lora-peft-cpu/adapter/` (`adapter_model.safetensors`, `adapter_config.json`,
`historico-loss.csv`; ignorado pelo git).

## Saída esperada

```text
parâmetros do modelo: 134.515.008 | treináveis (LoRA r=8): 921.600 (0.69%)
full fine-tuning treinaria 134.515.008 parâmetros (+ estados do Adam = ~1.6 GB só de pesos/gradientes/otimizador em fp32)
época 1 passo   1/46  loss=4.7383
época 1 passo   5/46  loss=1.9363
época 1 passo  10/46  loss=0.6431
época 1 passo  15/46  loss=0.2869
época 1 passo  20/46  loss=0.3201
época 2 passo  25/46  loss=0.1738
época 2 passo  30/46  loss=0.1087
época 2 passo  35/46  loss=0.3021
época 2 passo  40/46  loss=0.1142
época 2 passo  45/46  loss=0.0852

treino: 46 passos em 127 s (CPU)
loss de validação: 5.0888 -> 0.2494
adapter salvo em exemplos/03-lora-peft-cpu/adapter: 3.7 MB (o modelo base tem ~269 MB em bf16)
```

## Experimente

1. `--r 2` e `--r 32`: compare % treinável, tamanho do adapter e loss de validação.
2. Tire o mascaramento do prompt em `tokenizar` (use `labels = input_ids`) e veja a loss inicial e a acurácia no exemplo 04.
3. Inclua `"gate_proj", "up_proj", "down_proj"` em `target_modules` (LoRA também na MLP).
