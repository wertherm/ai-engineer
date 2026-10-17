# 01 · Primeira chamada ao vLLM

**Conceito novo:** o vLLM expõe uma API **compatível com a da OpenAI**. Mesmo JSON, mesmo SDK; muda só o `base_url`.
**Pré-requisito:** vLLM no ar (`bash ../../infra/subir-vllm.sh`). Teoria em [docs/03](../../docs/03-vllm-servindo-modelos.md).

## Como rodar

```bash
bash exemplos/01-primeira-chamada/chamada.sh          # com curl
uv run python exemplos/01-primeira-chamada/chamada.py # com o SDK openai
```

## Saída esperada

Saída real de 2026-10-13 (vLLM 0.31.0, Qwen2.5-0.5B-Instruct, CPU). Com `temperature=0` ela se repete:

```
== Modelos servidos ==
['qwen-mini']
== Chat completion ==
Um container é um sistema de software que se torna independente do hardware onde está instalado, permitindo a distribuição e manutenção de aplicativos e serviços.
uso: {'prompt_tokens': 31, 'total_tokens': 67, 'completion_tokens': 36, ...}
```

```
Um container é um sistema de software que se torna independente do hardware ...
tokens: entrada=31 saída=36
motivo de parada: stop
```

Repare: a definição é **imprecisa** (container não é "independente do hardware"; ele isola processos e
compartilha o kernel). Um modelo de 0,5B é ótimo para aprender a operar, ruim como fonte de verdade.
É por isso que o exemplo 05 existe.

## Experimente

1. Troque `model="qwen-mini"` por `"gpt-4"` e veja o erro 404: o nome tem de bater com `--served-model-name`.
2. Tire a mensagem `system` e compare o idioma e o tamanho da resposta.
3. Chame `curl localhost:8000/version` e `curl localhost:8000/health`: são os endpoints que um orquestrador usa.
