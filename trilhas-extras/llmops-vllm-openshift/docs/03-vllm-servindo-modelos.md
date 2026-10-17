# 04 · vLLM: servindo modelos

## Objetivo

Subir, configurar e consumir o vLLM, e entender as três ideias que o tornam rápido: **PagedAttention**,
**continuous batching** e **prefix caching**.

## O que o vLLM é (e não é)

O vLLM é um **servidor de inferência**: carrega os pesos do modelo, recebe requisições HTTP e devolve
tokens. Ele não treina modelos, não guarda conversas e não decide se a resposta é boa. Essas são outras
etapas do LLMOps.

Versão estudada: **0.31.0** (2026-10-05).

## As ideias que importam

**PagedAttention.** Em vez de reservar um bloco contínuo de memória para o KV cache de cada requisição
(desperdiçando o que não for usado), o vLLM divide o cache em **páginas** de tamanho fixo, como a memória
virtual de um sistema operacional. Resultado: quase nada de fragmentação, mais requisições cabendo ao
mesmo tempo e blocos compartilháveis entre requisições.

**Continuous batching.** O agendador decide **a cada passo** quais requisições entram e saem do lote, sem
esperar o lote inteiro terminar. Uma resposta curta não fica presa atrás de uma longa. No
[exemplo 06](../exemplos/06-carga-e-custo/), o throughput subiu 56% de 1 para 4 requisições simultâneas.

**Prefix caching (APC).** Se uma requisição nova começa com o mesmo texto de uma anterior (o mesmo prompt
de sistema, o mesmo documento), o KV cache desse prefixo é reaproveitado e o prefill é pulado. Vem
**ligado por padrão**. No [exemplo 03](../exemplos/03-streaming-ttft-itl/), o TTFT do prompt longo caiu de
10,3 s para 2,8 s na repetição.

## Subindo o servidor

```bash
vllm serve Qwen/Qwen2.5-0.5B-Instruct \
  --dtype bfloat16 \
  --max-model-len 4096 \
  --served-model-name qwen-mini \
  --port 8000 \
  --api-key "$VLLM_API_KEY"
```

| Flag | Por quê |
|---|---|
| `--dtype bfloat16` | em CPU, `float16` é instável |
| `--max-model-len 4096` | contexto máximo; menor que o padrão (32k) para o KV cache caber com folga |
| `--served-model-name` | nome que o cliente usa no campo `model` |
| `--api-key` | opcional: exige `Authorization: Bearer ...` |

Na imagem Docker, tudo depois do nome da imagem vira argumento do `vllm serve` (veja `infra/subir-vllm.sh`).

Variáveis de ambiente específicas de CPU:

| Variável | O que faz | Neste repo |
|---|---|---|
| `VLLM_CPU_KVCACHE_SPACE` | GiB de KV cache (a doc a chama de legado e sugere `--kv-cache-memory-bytes`) | `2` |
| `VLLM_CPU_OMP_THREADS_BIND` | núcleos usados pela inferência; reserve 1–2 para o servidor | `0-5` |

## Endpoints

| Endpoint | Para quê |
|---|---|
| `POST /v1/chat/completions` | conversa (aplica o *chat template* do modelo) |
| `POST /v1/completions` | texto cru (sem template) |
| `GET /v1/models` | modelos servidos |
| `GET /health` | 200 quando pronto: usado por probes do Kubernetes |
| `GET /metrics` | métricas Prometheus ([docs/04](04-metricas-e-observabilidade.md)) |
| `GET /version`, `POST /tokenize`, `POST /detokenize` | utilitários |

O vLLM também expõe `/v1/responses`, `/v1/embeddings` e até `/v1/messages` (formato Anthropic).

## Consumindo

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="local")
r = client.chat.completions.create(
    model="qwen-mini",
    messages=[{"role": "user", "content": "O que é um pod?"}],
    temperature=0,
    max_tokens=60,
)
print(r.choices[0].message.content, r.usage)
```

Qualquer ferramenta que fala com a OpenAI (LangChain, LiteLLM, promptfoo) fala com o vLLM trocando o `base_url`.

## Uso offline (sem servidor)

Para processar um lote de prompts dentro de um script:

```python
from vllm import LLM, SamplingParams

if __name__ == "__main__":  # obrigatório: o vLLM cria processos filhos
    llm = LLM(model="Qwen/Qwen2.5-0.5B-Instruct", max_model_len=2048)
    saidas = llm.chat([[{"role": "user", "content": "Diga oi."}]], SamplingParams(temperature=0, max_tokens=20))
    print(saidas[0].outputs[0].text)
```

Use `llm.chat` com modelos *instruct*: `llm.generate` **não** aplica o chat template e a saída fica estranha.
Este repo não executa esse trecho, porque exige o vLLM instalado como pacote Python.

## Armadilhas

- `--api-key` só protege `/v1`, `/v2` e `/inference`. `/metrics` e `/health` continuam abertos: não exponha a porta crua na internet.
- O campo `model` da requisição tem de bater com o `--served-model-name`, senão vem um 404.
- O modelo traz padrões de sampling no `generation_config.json`; mande os parâmetros explicitamente.
- Benchmarks repetidos no mesmo servidor são inflados pelo prefix caching.

## Fontes

- Quickstart: https://docs.vllm.ai/en/latest/getting_started/quickstart.html
- Servidor compatível com OpenAI: https://docs.vllm.ai/en/latest/serving/online_serving/
- Prefix caching: https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html
- PagedAttention (paper): https://arxiv.org/abs/2309.06180
- Release 0.31.0: https://github.com/vllm-project/vllm/releases/tag/v0.31.0
