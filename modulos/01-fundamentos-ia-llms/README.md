# Módulo 01 · Fundamentos de IA e LLMs para Programadores

Da primeira ideia de "máquina inteligente" aos LLMs: tensores e redes neurais em JavaScript, visão
computacional no browser, prompt engineering medido, primeiro RAG com Postgres/pgvector, MCP e a escolha
entre modelos abertos (Ollama) e proprietários (OpenRouter). Tudo roda localmente, sem chave de API.

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| História e contexto da IA: primeira ideia de "máquina inteligente", linha do tempo até ML, DL, LLMs e ferramentas atuais | [doc 01](docs/01-historia-e-contexto-da-ia.md) |
| Introdução a LLMs: revisão de ML, DL e IA | [doc 01](docs/01-historia-e-contexto-da-ia.md#ia-ml-dl-e-llm-em-uma-frase-cada) · [doc 02](docs/02-ml-dl-tensores-e-redes-neurais.md) |
| Introdução a LLMs: como funcionam (transformers, embeddings, attention) | [doc 03](docs/03-llms-e-prompt-engineering.md) |
| Introdução a LLMs: exemplos de LLMs (ChatGPT, Gemini e outros) | [doc 03](docs/03-llms-e-prompt-engineering.md#exemplos-de-llms-2026) · [exemplo 06](exemplos/06-openrouter-e-ollama/) |
| Web ML: diferença entre ML, DL e IA | [doc 02](docs/02-ml-dl-tensores-e-redes-neurais.md) |
| Web ML: como tensores funcionam e por que são a base | [doc 02](docs/02-ml-dl-tensores-e-redes-neurais.md) · [exemplo 01](exemplos/01-tensores/) |
| Web ML: redes neurais e como aprendem | [doc 02](docs/02-ml-dl-tensores-e-redes-neurais.md) · [exemplo 02](exemplos/02-primeira-rede-neural/) |
| Primeira IA do zero: criar e treinar a primeira rede neural em JavaScript | [exemplo 02](exemplos/02-primeira-rede-neural/) · [exercício 01](exercicios/01-rede-neural-espirais/) |
| Primeira IA do zero: ciclo dados → treino → validação → inferência | [exemplo 02](exemplos/02-primeira-rede-neural/) · [doc 02](docs/02-ml-dl-tensores-e-redes-neurais.md) |
| Projetos com ML na Web: vídeo no browser (detecção, tracking, filtros) | [exemplo 03](exemplos/03-visao-no-browser/) (vídeo de arquivo no lugar da câmera) |
| Projetos com ML na Web: Deep Learning em cenários reais | [doc 02](docs/02-ml-dl-tensores-e-redes-neurais.md#ml-na-web) · [exemplo 03](exemplos/03-visao-no-browser/) |
| Prompt Engineering: prompts que geram boas respostas | [doc 03](docs/03-llms-e-prompt-engineering.md) · [exemplo 04](exemplos/04-prompt-engineering/) |
| Prompt Engineering: padrões para codar, debugar, documentar e aprender | [doc 03](docs/03-llms-e-prompt-engineering.md#padrões-para-o-dia-a-dia-de-dev) |
| MCPs: o que são e como conectam IA a APIs/serviços | [doc 04](docs/04-rag-mcp-e-modelos.md#mcp-e-automação-para-devs-visão-introdutória) · aprofundado no [módulo 03](../03-mcp/README.md) |
| MCPs: gerar testes, consultar doc atualizada, navegar em sites e extrair informação | [doc 04](docs/04-rag-mcp-e-modelos.md) (não executado localmente: depende do host de IA) |
| MCPs: N8N MCP e similares | [doc 04](docs/04-rag-mcp-e-modelos.md) (não executado localmente: exige instância n8n) |
| RAG: o que é e por que importa | [doc 04](docs/04-rag-mcp-e-modelos.md) |
| RAG: embeddings e Vector Databases; similarity search | [doc 04](docs/04-rag-mcp-e-modelos.md) · [exemplo 05](exemplos/05-primeiro-rag/) |
| **Projeto: primeiro RAG com JavaScript e Postgres** | [exemplo 05](exemplos/05-primeiro-rag/) · [exercício 02](exercicios/02-rag-chunking-top-k/) |
| Modelos open-source vs proprietários: vantagens e desvantagens | [doc 04](docs/04-rag-mcp-e-modelos.md#modelos-open-source-x-proprietários) |
| OpenRouter para orquestrar vários modelos | [exemplo 06](exemplos/06-openrouter-e-ollama/) (catálogo executado; chamadas remotas não executadas localmente: exigem chave) |
| Rodar modelos localmente com Ollama | [exemplo 06](exemplos/06-openrouter-e-ollama/) · todos os exemplos 04–06 |
| Aplicar ML em jogos | fora do escopo deste repositório, a pedido |
| Ferramentas de IA para acelerar sua vida como Dev (Cursor, Windsurf, .cursor rules, vibe coding) | fora do escopo deste repositório, a pedido |
| Agents e automação avançada | fora do escopo deste repositório, a pedido |

## Pré-requisitos

```bash
# na raiz do repo: Ollama (qwen3.5:4b + qwen3-embedding:0.6b) e Postgres 18 + pgvector na porta 5433
bash infra/subir-ia.sh
cd modulos/01-fundamentos-ia-llms
npm install
```

- Node 24, Google Chrome (exemplo 03, usado pelo `playwright-core`) e `ffmpeg` (gera o vídeo de amostra).
- Versão Python: [`uv`](https://docs.astral.sh/uv/) e Python 3.14 (fixado na raiz). O módulo tem projeto próprio
  ([`pyproject.toml`](pyproject.toml) + `uv.lock`): `uv sync` na pasta do módulo. Código compartilhado em
  [`comum_py/`](comum_py/) (equivalente ao `lib/` do JS); cada exemplo/solução tem uma subpasta `python/`.
- Variáveis (opcionais, com defaults do [`infra/.env.example`](../../infra/.env.example)): `OPENAI_BASE_URL`,
  `OPENAI_API_KEY`, `MODELO_CHAT`, `MODELO_EMBED`, `DATABASE_URL`. O cliente único está em [`lib/llm.js`](lib/llm.js).
- O Postgres é usado só no schema `m01` (tabela `m01.chunks`; a versão Python usa `m01.chunks_py`). Portas deste módulo: 30100–30199 (exemplo 03 usa 30100).

## Como rodar

```bash
cd modulos/01-fundamentos-ia-llms
npm run ex01                 # tensores (instantâneo)
npm run ex02                 # primeira rede neural (~2 s)
npm test                     # testes (node --test)
npm run ex03:assets          # baixa modelo/foto e gera o vídeo (1 vez)
npm run ex03                 # visão no browser com Chrome headless
npm run ex04                 # prompt engineering medido (12 chamadas ao LLM: minutos em CPU)
npm run ex05:indexar && npm run ex05   # primeiro RAG
npm run ex06                 # Ollama local + catálogo do OpenRouter
npm run exercicio01          # solução: espirais (~45 s)
npm run exercicio02          # solução: chunking e top-k (só embeddings)
```

Versão Python (mesmos dados, mesmo modelo e mesmo banco):

```bash
cd modulos/01-fundamentos-ia-llms
uv sync                                                        # 1 vez (numpy, openai, psycopg, pgvector, mediapipe...)
uv run python exemplos/01-tensores/python/main.py              # tensores com NumPy
uv run python exemplos/02-primeira-rede-neural/python/main.py  # rede neural em NumPy (backprop à mão, ~0,1 s)
uv run pytest                                                  # testes Python (dados, gradient check, chunking)
uv run python exemplos/03-visao-no-browser/python/main.py      # MediaPipe Python + OpenCV (baixa assets se faltar)
uv run python exemplos/04-prompt-engineering/python/main.py    # 12 chamadas ao LLM (~1 min)
uv run python exemplos/05-primeiro-rag/python/indexar.py && uv run python exemplos/05-primeiro-rag/python/perguntar.py
uv run python exemplos/06-openrouter-e-ollama/python/main.py
uv run python exercicios/01-rede-neural-espirais/solucao/python/solucao.py   # ~1 s
uv run python exercicios/02-rag-chunking-top-k/solucao/python/solucao.py     # só embeddings
```

## Status de verificação

Executado em 2026-10-16 (Node 24.11.1, CPU, Ollama `qwen3.5:4b` e `qwen3-embedding:0.6b`, Postgres 18 + pgvector 0.8.7).
Versão Python executada em 2026-10-17 (Python 3.14.7 via `uv`, mesmas infra e modelos).

| Item | Status (JS) | Status (Python) |
|---|---|---|
| Exemplo 01 · tensores | ✅ executado | ✅ executado (NumPy 2.5.4) |
| Exemplo 02 · primeira rede neural (+ testes) | ✅ executado (99,3% no teste; 4 testes passando) | ✅ executado (98,7% no teste; NumPy à mão; 5 testes pytest) |
| Exemplo 03 · visão no browser | ✅ executado com Chrome headless e vídeo gerado de foto (sem câmera: headless não tem webcam) | ✅ executado fora do browser (MediaPipe 1.1.1 Python + OpenCV): 40/40 frames, 4 trilhas estáveis |
| Exemplo 04 · prompt engineering | ✅ executado (A 0/4, B 4/4, C 3/4) | ✅ executado (A 0/4, B 4/4, C 3/4) |
| Exemplo 05 · primeiro RAG | ✅ executado (indexação + pergunta com e sem RAG) | ✅ executado (tabela `m01.chunks_py`) |
| Exemplo 06 · Ollama + OpenRouter | ✅ parte local e catálogo público · ⚠️ chamadas remotas ao OpenRouter não executadas localmente (exigem `OPENROUTER_API_KEY`, conta e crédito) | ✅ parte local e catálogo · ⚠️ parte remota não executada localmente (mesmo motivo) |
| Exercício 01 · espirais | ✅ executado (100% no teste) | ✅ executado (98,9% no teste, escolheu 2x32) |
| Exercício 02 · chunking e top-k | ✅ executado | ✅ executado (tabela idêntica à do JS) |
| MCP (Playwright, Context7, n8n) | ⚠️ não executado localmente: configuração depende do host de IA e de instância n8n; prática no [módulo 03](../03-mcp/README.md) | — (só conceitual) |

## Fontes

- TensorFlow.js: https://js.tensorflow.org/api/latest/
- NumPy: https://numpy.org/doc/stable/ · MediaPipe Object Detector (Python): https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/python
- psycopg 3: https://www.psycopg.org/psycopg3/docs/ · pgvector-python: https://github.com/pgvector/pgvector-python · OpenAI Python SDK: https://github.com/openai/openai-python
- MediaPipe Object Detector (Web): https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/web_js
- *Attention Is All You Need*: https://arxiv.org/abs/1706.03762
- pgvector: https://github.com/pgvector/pgvector · pgvector-node: https://github.com/pgvector/pgvector-node
- Ollama (API compatível com OpenAI): https://docs.ollama.com/api/openai-compatibility
- OpenRouter: https://openrouter.ai/docs/quickstart
- Model Context Protocol: https://modelcontextprotocol.io/docs/getting-started/intro
- Guias de prompt: https://platform.openai.com/docs/guides/prompt-engineering · https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview
