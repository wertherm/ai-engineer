# Exemplo 04 · Banco de perguntas técnicas de IA + simulador de entrevista

**Conceito novo:** treino deliberado de entrevista técnica. Um banco versionado de perguntas (RAG × fine-tuning,
agentes, custo, falhas, avaliação, segurança, latência, chunking, explicar decisões, live coding) com
pontos-chave, resposta-modelo e armadilhas; um simulador que sorteia perguntas com seed e avalia a sua resposta
escrita de dois jeitos: **checklist offline** (regex dos pontos-chave) e, opcionalmente, **feedback do LLM
local** segundo uma rubrica (`rubrica.md`).

**Pré-requisito:** `npm install`. Para `--llm`, a infra no ar (`bash infra/subir-ia.sh` na raiz) com o
`qwen3.5:4b` no Ollama.

## Como rodar

```bash
cd modulos/12-carreira
npm run ex04                     # sorteia 3 perguntas (seed 12)
node exemplos/04-simulador-de-entrevista/simulador.js --avaliar chunking --resposta "Depende da estrutura..."
npm run ex04:llm                 # avalia resposta-exemplo.txt com checklist + LLM (~1 min com o Ollama livre)
node --test exemplos/04-simulador-de-entrevista/
```

## Saída esperada

`npm run ex04` (real, 2026-10-16):

```text
Entrevista simulada (seed 12) · 10 perguntas no banco

1. [rag · junior] Como você escolhe o tamanho dos chunks num RAG?
   avaliar: node exemplos/04-simulador-de-entrevista/simulador.js --avaliar chunking --resposta "..."
2. [resiliencia · pleno] Como seu sistema lida com falhas do provedor de LLM (timeout, 429, 5xx)?
   avaliar: node exemplos/04-simulador-de-entrevista/simulador.js --avaliar falhas-do-provedor --resposta "..."
3. [agentes · pleno] Quando faz sentido usar um agente em vez de um fluxo fixo (workflow)?
   avaliar: node exemplos/04-simulador-de-entrevista/simulador.js --avaliar quando-usar-agentes --resposta "..."
```

`npm run ex04:llm` (real, 2026-10-16, qwen3.5:4b em CPU, 67 s no total):

```text
Pergunta: Quando você usaria RAG e quando usaria fine-tuning?
Resposta: Eu usaria RAG quando a informação muda com frequência, porque basta reindexar os documentos. Fine-tuning eu usaria para ensinar o estilo da empresa ao modelo.

Cobertura dos pontos-chave: 40%
  [x] RAG para conhecimento que muda ou precisa de fonte citável
  [x] fine-tuning para forma, estilo, formato ou tarefa estreita, não para fatos
  [ ] custo e esforço: dados rotulados, retreino, avaliação
  [ ] começar por prompt + RAG e medir antes de treinar
  [ ] podem ser combinados

Armadilhas comuns: dizer que fine-tuning 'ensina a base de conhecimento' · não falar de avaliação para decidir

Pedindo feedback ao LLM (pode levar alguns minutos em CPU)...

Feedback (qwen3.5:4b, 66 s, 44 tokens):
5 – Nota técnica correta e cobriu bem os cenários de atualização vs. estilo. Faltou mencionar custos, esforço de dados rotulados e a estratégia de começar com RAG antes de treinar.

Resposta-modelo:
Começo por prompt engineering e RAG, e só considero fine-tuning com uma avaliação mostrando que eles não bastam. ...
```

Repare na contradição: o modelo dá **nota 5** e, na mesma frase, lista três pontos que faltaram (o checklist
dá 40%). É o retrato de um LLM-as-judge pequeno e não calibrado: o **texto** do feedback é útil, a **nota**
não. Use a nota do checklist (determinística) e leia o feedback como sugestão; em produção, calibre o juiz
contra notas humanas (ver [doc 04](../../docs/04-entrevistas-tecnicas-de-ia.md)).

## Experimente

1. Responda em voz alta a uma pergunta sorteada, cronometre (alvo: 1–2 min), transcreva e avalie.
2. Adicione uma pergunta ao `perguntas.json` (ex.: "como você versiona prompts?") — o teste garante que a
   resposta-modelo cobre os próprios pontos-chave.
3. Peça ao LLM uma nota em JSON por critério da rubrica e compare com o checklist em 5 respostas suas.

## Versão Python

`python/simulador.py` (argparse, mulberry32 com aritmética de 32 bits, LLM via SDK `openai` Python em
`comum_py/llm.py`) e `python/test_simulador.py` (pytest, nenhum teste chama o LLM). Lê os mesmos
`perguntas.json`, `rubrica.md` e `resposta-exemplo.txt`.

### Como rodar

```bash
cd modulos/12-carreira
uv run python exemplos/04-simulador-de-entrevista/python/simulador.py --sortear 3 --seed 12
uv run python exemplos/04-simulador-de-entrevista/python/simulador.py --avaliar rag-vs-fine-tuning --llm \
  --resposta-arquivo exemplos/04-simulador-de-entrevista/resposta-exemplo.txt
uv run pytest exemplos/04-simulador-de-entrevista/
```

### Saída esperada (Python)

`--sortear 3 --seed 12` (real, 2026-10-17): as mesmas perguntas do JS. Também conferi as 10 posições do
sorteio com as seeds 3, 12, 2024 e 99999:

```text
Entrevista simulada (seed 12) · 10 perguntas no banco

1. [rag · junior] Como você escolhe o tamanho dos chunks num RAG?
   avaliar: uv run python exemplos/04-simulador-de-entrevista/python/simulador.py --avaliar chunking --resposta "..."
2. [resiliencia · pleno] Como seu sistema lida com falhas do provedor de LLM (timeout, 429, 5xx)?
   avaliar: uv run python exemplos/04-simulador-de-entrevista/python/simulador.py --avaliar falhas-do-provedor --resposta "..."
3. [agentes · pleno] Quando faz sentido usar um agente em vez de um fluxo fixo (workflow)?
   avaliar: uv run python exemplos/04-simulador-de-entrevista/python/simulador.py --avaliar quando-usar-agentes --resposta "..."
```

`--avaliar ... --llm` (real, 2026-10-17, executado uma vez, qwen3.5:4b em CPU, 28 s no total). O
feedback saiu igual ao do JS (temperature 0):

```text
Cobertura dos pontos-chave: 40%
  [x] RAG para conhecimento que muda ou precisa de fonte citável
  [x] fine-tuning para forma, estilo, formato ou tarefa estreita, não para fatos
  [ ] custo e esforço: dados rotulados, retreino, avaliação
  [ ] começar por prompt + RAG e medir antes de treinar
  [ ] podem ser combinados

Armadilhas comuns: dizer que fine-tuning 'ensina a base de conhecimento' · não falar de avaliação para decidir

Pedindo feedback ao LLM (pode levar alguns minutos em CPU)...

Feedback (qwen3.5:4b, 21 s, 44 tokens):
5 – Nota técnica correta e cobriu bem os cenários de atualização vs. estilo. Faltou mencionar custos, esforço de dados rotulados e a estratégia de começar com RAG antes de treinar.

Resposta-modelo:
Começo por prompt engineering e RAG, e só considero fine-tuning com uma avaliação mostrando que eles não bastam. ...
```
