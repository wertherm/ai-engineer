# Exemplo 04 · Avaliação A/B: genérico × customizado (servidor OpenAI-compatível + JS)

**Conceito novo:** avaliar um modelo fine-tunado contra o genérico com as mesmas entradas e métricas —
acurácia (exact match), adequação de formato, consistência, recall por categoria, exemplos lado a lado e
perda de generalização fora do domínio — com log de cada predição (JSONL) e resumo acumulado (CSV).

**Como o JS fala com o LoRA:** `servidor_openai.py` (só stdlib) expõe `POST /v1/chat/completions` com dois
modelos sobre os mesmos pesos: `smollm2-base` (adapter desligado com `disable_adapter()`) e
`smollm2-suporte-lora`. O `avaliar.js` usa o SDK `openai` normal apontando para `http://localhost:30900/v1`.

**Pré-requisito:** [exemplo 03](../03-lora-peft-cpu/) (adapter treinado).

## Como rodar

```bash
cd modulos/09-dados-e-fine-tuning
uv run python exemplos/04-avaliacao-ab/servidor_openai.py &     # porta 30900; anote o PID
curl -s localhost:30900/v1/models
node exemplos/04-avaliacao-ab/avaliar.js
kill <PID>
```

## Saída esperada

```text
{"object": "list", "data": [{"id": "smollm2-base", "object": "model"}, {"id": "smollm2-suporte-lora", "object": "model"}]}
│ modelo                 │ n  │ acuracia │ formato_valido │ consistencia │ segundos │
│ 'smollm2-base'         │ 46 │ 0        │ 0              │ 1            │ 46       │
│ 'smollm2-suporte-lora' │ 46 │ 0.674    │ 1              │ 1            │ 29       │
Recall por categoria:
│ modelo                 │ recall_cobranca │ recall_acesso │ recall_entrega │ recall_defeito │ recall_cancelamento │
│ 'smollm2-base'         │ 0               │ 0             │ 0              │ 0              │ 0                   │
│ 'smollm2-suporte-lora' │ 0.7             │ 0.4           │ 0.6            │ 1              │ 0.67                │
Exemplos (base × LoRA):
- "Bom dia! Quero encerrar minha conta e cancelar tudo." esperado=cancelamento | base="Bom dia! Quero encerr" | lora="cancelamento"
- "O botão do cadeira gamer está travado." esperado=defeito | base="O botão do cadeira gam" | lora="defeito"
- "A tela do notebook veio com manchas. Att." esperado=defeito | base="A tela do notebook, com man" | lora="defeito"
- "Socorro! Minha sessão expira assim que eu faço login. Valeu!" esperado=acesso | base="Socorro! Minha sess" | lora="acesso"

Fora do domínio (sem system prompt):
- Qual é a capital da França?
    base: Qual é a capital da França?
    lora: cacapella
- Escreva uma frase de boas-vindas para um cliente novo.
    base: "Welcome to our office. Please, do not hesitate to contact us if you need any assistance or
    lora: defeita
- Quanto é 2 + 2?
    base: O que é 2 + 2?
    lora: 2

log por predição: exemplos/04-avaliacao-ab/resultados/ab-2026-10-17T10-27-31.jsonl · resumo acumulado: exemplos/04-avaliacao-ab/resultados/resumo.csv
```

**Leitura:** o base de 135M não segue a instrução (repete o ticket: formato 0%); o LoRA sempre responde uma
categoria válida e acerta 67%, com `acesso` fraco (recall 0,4) — a média escondia isso. Fora do domínio o LoRA
**perdeu generalização**: virou classificador e inventa rótulos. Por isso, no projeto final, ele só recebe
tickets e há guardrail.

## Experimente

1. Treine com `--epocas 4` no exemplo 03, reinicie o servidor e rode de novo: o `resumo.csv` acumula as duas linhas.
2. Adicione o `qwen3.5:4b` (Ollama) como 3º competidor com poucos exemplos (`max_tokens` 5): "modelo maior" × "modelo pequeno ajustado".
3. Mande ao LoRA o ticket com uma frase nova ("o app trava ao pagar") e veja se a categoria faz sentido.

## Versão Python

O servidor (`servidor_openai.py`) já era Python. A versão Python do avaliador é [`python/avaliar.py`](python/avaliar.py):
SDK `openai` Python contra o mesmo servidor, log em `resultados/python/ab-<data>.jsonl` e resumo em
`resultados/python/resumo.csv` (separados dos do JS). As duas perguntas fora do domínio de cada modelo vão em
paralelo com `ThreadPoolExecutor` (o `Promise.all` do JS).

**Como rodar** (da pasta do módulo; aqui o servidor subiu na porta 30950):

```bash
PORTA=30950 uv run python exemplos/04-avaliacao-ab/servidor_openai.py &   # anote o PID
LORA_BASE_URL=http://localhost:30950/v1 uv run python exemplos/04-avaliacao-ab/python/avaliar.py
kill <PID>
```

**Saída esperada (Python)** — saída real, com as mesmas métricas do JS (decodificação gulosa = determinística):

```text
┌──────────────────────┬────┬──────────┬────────────────┬──────────────┬──────────┐
│ modelo               │ n  │ acuracia │ formato_valido │ consistencia │ segundos │
├──────────────────────┼────┼──────────┼────────────────┼──────────────┼──────────┤
│ smollm2-base         │ 46 │ 0        │ 0              │ 1            │ 43       │
│ smollm2-suporte-lora │ 46 │ 0.674    │ 1              │ 1            │ 84       │
└──────────────────────┴────┴──────────┴────────────────┴──────────────┴──────────┘
Recall por categoria:
│ smollm2-suporte-lora │ 0.7             │ 0.4           │ 0.6            │ 1              │ 0.67                │
Exemplos (base × LoRA):
- "Bom dia! Quero encerrar minha conta e cancelar tudo." esperado=cancelamento | base="Bom dia! Quero encerr" | lora="cancelamento"
...
Fora do domínio (sem system prompt):
- Qual é a capital da França?
    base: Qual é a capital da França?
    lora: cacapella
...
log por predição: exemplos/04-avaliacao-ab/resultados/python/ab-2026-10-17T23-37-19.jsonl · resumo acumulado: exemplos/04-avaliacao-ab/resultados/python/resumo.csv
```
