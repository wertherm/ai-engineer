# Módulo 02 · APIs de IA Generativa e Prompt Engineering

Como usar uma API de LLM (formato OpenAI) **como engenheiro**: prompts encadeados e versionados, saídas
previsíveis e validadas, custo sob controle, RAG resiliente e observável, integração com um back-end de
verdade e aplicações multimodais (documentos, imagem e áudio) — tudo rodando localmente, sem chave de API.

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| Panorama do mercado de IA como serviço | fora do escopo deste repositório, a pedido |
| Principais provedores de modelos de IA (OpenAI, Anthropic, Hugging Face, Gemini) | fora do escopo deste repositório, a pedido |
| **Engenharia de prompts avançada** | |
| · Prompt chaining | [doc 01](docs/01-engenharia-de-prompts-avancada.md) · [exemplo 01](exemplos/01-prompt-chaining-e-templates/) · [exercício 01](exercicios/01-chain-com-validacao-e-retry/) |
| · Prompt templates para padronizar e reutilizar | [doc 01](docs/01-engenharia-de-prompts-avancada.md) · [exemplo 01](exemplos/01-prompt-chaining-e-templates/) (`templates.js`) · [exemplo 03](exemplos/03-rag-langchain-observabilidade/) (`ChatPromptTemplate`) |
| · Estratégias para reduzir alucinações e melhorar precisão | [doc 01](docs/01-engenharia-de-prompts-avancada.md) · exemplos [01](exemplos/01-prompt-chaining-e-templates/), [03](exemplos/03-rag-langchain-observabilidade/), [05](exemplos/05-documentos-ocr-e-visao/) · [exercício 01](exercicios/01-chain-com-validacao-e-retry/) |
| **Consistência e custo-eficiência** | |
| · Chamadas de API desenhadas pensando em custo | [doc 02](docs/02-consistencia-e-custo.md) · [exemplo 02](exemplos/02-custo-e-cache/) |
| · Cache, reuso de contexto e redução de tokens | [doc 02](docs/02-consistencia-e-custo.md) · [exemplo 02](exemplos/02-custo-e-cache/) |
| · Comportamento previsível (structured outputs/JSON Schema, temperatura, seed, zod) | [doc 02](docs/02-consistencia-e-custo.md) · [exemplo 01](exemplos/01-prompt-chaining-e-templates/) · [`comum/estruturado.js`](comum/estruturado.js) |
| **RAG avançado na prática** | |
| · LangChain (JS) para orquestrar fluxos | [doc 03](docs/03-rag-backend-e-observabilidade.md) · [exemplo 03](exemplos/03-rag-langchain-observabilidade/) |
| · Gerenciamento de erros e retentativas | [doc 03](docs/03-rag-backend-e-observabilidade.md) · [exemplo 03](exemplos/03-rag-langchain-observabilidade/) · [exercício 01](exercicios/01-chain-com-validacao-e-retry/) |
| · Logging, observabilidade e depuração | [doc 03](docs/03-rag-backend-e-observabilidade.md) · [exemplo 03](exemplos/03-rag-langchain-observabilidade/) · [exemplo 04](exemplos/04-api-backend-com-llm/) (logs do Fastify) |
| **Mão na massa: integrar um LLM a um back-end** (requisições, autenticação, versionamento, testes) | [doc 03](docs/03-rag-backend-e-observabilidade.md) · [exemplo 04](exemplos/04-api-backend-com-llm/) |
| **Modelos multimodais** | |
| · Quando usar texto, imagem, áudio e vídeo | [doc 04](docs/04-multimodal-e-aplicacoes.md) |
| · Visão geral: OpenAI Vision, Whisper, Gemini multimodal | [doc 04](docs/04-multimodal-e-aplicacoes.md) — chamadas à OpenAI e ao Gemini **não executadas localmente** (exigem conta paga); visão e Whisper executados com modelos locais nos exemplos 05 e 06 |
| **Aplicações práticas com APIs** | |
| · OCR inteligente para extrair e entender documentos | [exemplo 05](exemplos/05-documentos-ocr-e-visao/) · [exercício 02](exercicios/02-extrator-multimodal/) |
| · Análise de mídia (imagem/vídeo) para insights | [doc 04](docs/04-multimodal-e-aplicacoes.md) (frames com ffmpeg) · [exemplo 05](exemplos/05-documentos-ocr-e-visao/) |
| · Bots multimodais (texto, imagem, áudio) | [exemplo 06](exemplos/06-audio-e-bot-multimodal/) |

## Pré-requisitos

- Infra do repositório no ar (Ollama com `qwen3.5:4b` e `qwen3-embedding:0.6b`, Postgres + pgvector),
  a partir da **raiz** do repositório: `bash infra/subir-ia.sh`.
- Node 24 e npm 11. Na pasta do módulo: `npm install` (~1 GB em `node_modules`: ONNX Runtime, tesseract, canvas).
- Variáveis (opcionais; os defaults apontam para a infra local): `OPENAI_BASE_URL`, `OPENAI_API_KEY`,
  `MODELO_CHAT`, `MODELO_EMBED`, `DATABASE_URL` — veja [`infra/.env.example`](../../infra/.env.example).
  Trocar para a OpenAI ou o OpenRouter é só mudar essas variáveis; o código é o mesmo.
- Na 1ª execução são baixados: o idioma português do tesseract (~2,4 MB), o MMS-TTS (~37 MB) e o
  whisper-base (~76 MB), todos para `.cache/` (ignorado pelo git).
- Paciência com a CPU: cada chamada ao `qwen3.5:4b` leva de 30 s a 2 min; com visão, ~2 min.

| Dependência | Versão |
|---|---|
| openai | 7.34.0 |
| zod | 4.6.7 |
| @langchain/core · @langchain/openai | 1.2.18 · 1.6.2 |
| pg · pgvector | 8.23.1 · 0.3.0 |
| fastify · vitest | 5.12.7 · 5.0.5 |
| tesseract.js | 7.0.0 |
| @huggingface/transformers · wavefile | 4.3.1 · 11.0.0 |
| @napi-rs/canvas | 1.0.11 |
| undici (fetch sem o corte de 300 s) | 8.12.2 |

## Como rodar

```bash
cd modulos/02-apis-ia-generativa
npm install

npm test                    # testes rápidos (templates, API com LLM mockado, exercício 01) — sem rede
npm run test:integracao     # API + LLM real

npm run ex01                # prompt chaining + templates + zod
npm run ex02                # custo, cache de prefixo e cache de respostas (Postgres m02)
npm run ex03                # RAG com LangChain.js + retry + logs JSON
API_TOKEN=segredo-local npm run ex04   # API Fastify em http://localhost:30200 (Ctrl+C para parar)
npm run ex05                # OCR + LLM vs visão numa nota fiscal fictícia
npm run ex06:bot            # áudio → Whisper → resposta (ver README do exemplo 06 para imagem e texto)

npm run exe01               # solução do exercício 01
npm run exe02               # solução do exercício 02
```

## Status de verificação

Executado em **2026-10-16**, CPU de 8 núcleos sem GPU, com o Ollama compartilhado com outros processos
(por isso as latências altas; as saídas reais estão nos READMEs).

| Item | Status |
|---|---|
| Exemplo 01 — chaining + templates + zod | ✅ executado; 3 testes de template passam |
| Exemplo 02 — custo e cache | ✅ executado (104 → 33 tokens; 294/806 tokens do prefixo em cache; cache de respostas em 2 ms) |
| Exemplo 03 — RAG LangChain.js + retry + logs | ✅ executado com 2 falhas 503 injetadas e recuperadas |
| Exemplo 04 — API Fastify `/v1` | ✅ 7 testes unitários + 1 de integração com o Ollama; API no ar na porta 30200 testada com `curl` |
| Exemplo 05 — OCR + visão | ✅ executado (tesseract.js 94% de confiança; visão com `qwen3.5:4b`) |
| Exemplo 06 — TTS, Whisper e bot | ✅ executado (áudio, imagem e texto) |
| Exercício 01 — solução | ✅ 5 testes + execução real (aprovado/negado) |
| Exercício 02 — solução | ✅ executado (nítido → OCR 4/4; ruim → fallback para visão 3/4) |
| Chamadas à OpenAI (Vision, `audio.transcriptions`) e ao Gemini em [doc 04](docs/04-multimodal-e-aplicacoes.md) | ⚠️ não executadas localmente (exigem chave/conta paga); o mesmo formato foi executado contra o Ollama |
| Comandos `ffmpeg` de frames e áudio em [doc 04](docs/04-multimodal-e-aplicacoes.md) | ✅ executados num vídeo de teste gerado localmente |

## Fontes

- SDK `openai` (Node): https://github.com/openai/openai-node
- OpenAI — Structured outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI — Prompt caching: https://platform.openai.com/docs/guides/prompt-caching
- OpenAI — Images and vision: https://platform.openai.com/docs/guides/images-vision · Speech to text: https://platform.openai.com/docs/guides/speech-to-text
- Gemini — Vision / Audio / Video: https://ai.google.dev/gemini-api/docs/vision · https://ai.google.dev/gemini-api/docs/audio · https://ai.google.dev/gemini-api/docs/video-understanding
- Ollama — compatibilidade OpenAI: https://docs.ollama.com/api/openai-compatibility
- LangChain JS: https://docs.langchain.com/oss/javascript/langchain/overview
- Fastify — testes: https://fastify.dev/docs/latest/Guides/Testing/ · Vitest — mocking: https://vitest.dev/guide/mocking
- Zod: https://zod.dev/json-schema · tesseract.js: https://github.com/naptha/tesseract.js
- Transformers.js: https://huggingface.co/docs/transformers.js/index
