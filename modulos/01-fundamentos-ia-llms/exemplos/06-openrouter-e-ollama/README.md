# Exemplo 06 · Modelos open-source locais (Ollama) x catálogo multi-modelo (OpenRouter)

**Conceito novo:** o mesmo código (SDK `openai`) fala com um modelo de pesos abertos rodando na sua máquina
(Ollama) e com centenas de modelos abertos e proprietários atrás de uma API única (OpenRouter), trocando só
`baseURL`, chave e nome do modelo.

**Pré-requisito:** [exemplo 04](../04-prompt-engineering/) e Ollama no ar.

O script tem duas partes:

1. **Executada:** lista os modelos locais (API nativa `GET /api/tags` do Ollama: parâmetros, quantização,
   tamanho), faz uma pergunta ao `qwen3.5:4b` e lê o **catálogo público** do OpenRouter
   (`GET https://openrouter.ai/api/v1/models`, sem chave) com preço por milhão de tokens e janela de contexto.
2. **Não executada localmente** (precisa de `OPENROUTER_API_KEY`, conta e crédito): a mesma pergunta em
   vários modelos remotos, com o parâmetro `models` (extensão do OpenRouter) como fallback.

## Como rodar

```bash
cd modulos/01-fundamentos-ia-llms
npm run ex06
# Parte 2 (não executado localmente: exige chave do OpenRouter):
OPENROUTER_API_KEY=sk-or-... OPENROUTER_MODELOS="google/gemma-4-31b-it,anthropic/claude-haiku-5.5" npm run ex06
```

## Saída esperada

Saída real (parte 1; preços e contagem do catálogo mudam com o tempo):

```text
Modelos locais no Ollama (pesos abertos, rodando na SUA máquina):
  qwen3-embedding:0.6b    595.78M params | Q8_0 | 0.6 GB
  qwen3.5:4b                 4.2B params | Q4_K_M | 3.3 GB

[ollama qwen3.5:4b] Um embedding é uma representação numérica de dados (como palavras, imagens ou objetos) que captura suas características semânticas e relações em um espaço vetorial multidimensional.
  -> 35 tokens em 36.6s | custo: R$ 0 (energia da sua máquina)

OpenRouter: 467 modelos no catálogo, 16 com variante :free
  anthropic/claude-haiku-5.5     entrada US$ 0.10/M tok | saída US$ 0.50/M tok | contexto 1000000
  google/gemini-3.5-flash-lite   entrada US$ 0.30/M tok | saída US$ 2.50/M tok | contexto 1048576
  deepseek/deepseek-v4.1-flash   entrada US$ 0.04/M tok | saída US$ 0.64/M tok | contexto 1048576
  google/gemma-4-31b-it          entrada US$ 0.20/M tok | saída US$ 0.40/M tok | contexto 262144

[parte 2 pulada] defina OPENROUTER_API_KEY para comparar modelos remotos (não executado localmente).
```

Compare: 35 tokens em 36,6 s no CPU local (grátis, privado, lento) contra modelos remotos que cobram
centavos por milhão de tokens e respondem em segundos, mas recebem seus dados.

## Experimente

1. `ollama pull <modelo>` (ex.: um modelo menor) e rode de novo: ele aparece na lista e você pode usá-lo com `MODELO_CHAT=<modelo> npm run ex06`.
2. Filtre o catálogo do OpenRouter pelos modelos com `context_length >= 1000000` e ordene por preço de entrada.
3. Aponte o exemplo 04 para o OpenRouter só com variáveis de ambiente: `OPENAI_BASE_URL=https://openrouter.ai/api/v1 OPENAI_API_KEY=... MODELO_CHAT=...` (não executado localmente).

## Versão Python

`httpx` para as APIs REST (`/api/tags` do Ollama, catálogo público do OpenRouter) e o SDK `openai` para o chat.
O campo `models` (fallback do OpenRouter) não existe na API da OpenAI: em Python ele vai em `extra_body`.

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/06-openrouter-e-ollama/python/main.py
```

**Saída esperada (Python)** — saída real (a parte 2 não foi executada localmente: exige `OPENROUTER_API_KEY`, conta e crédito):

```text
Modelos locais no Ollama (pesos abertos, rodando na SUA máquina):
  qwen3-embedding:0.6b    595.78M params | Q8_0 | 0.6 GB
  qwen3.5:4b                 4.2B params | Q4_K_M | 3.3 GB

[ollama qwen3.5:4b] Um embedding é uma representação numérica de dados (como palavras, imagens ou objetos) que captura suas características semânticas e relações em um espaço vetorial multidimensional.
  -> 35 tokens em 5.6s | custo: R$ 0 (energia da sua máquina)

OpenRouter: 470 modelos no catálogo, 16 com variante :free
  anthropic/claude-haiku-5.5     entrada US$ 0.10/M tok | saída US$ 0.50/M tok | contexto 1000000
  google/gemini-3.5-flash-lite   entrada US$ 0.30/M tok | saída US$ 2.50/M tok | contexto 1048576
  deepseek/deepseek-v4.1-flash   entrada US$ 0.15/M tok | saída US$ 0.60/M tok | contexto 1048576
  google/gemma-4-31b-it          entrada US$ 0.20/M tok | saída US$ 0.40/M tok | contexto 262144

[parte 2 pulada] defina OPENROUTER_API_KEY para comparar modelos remotos (não executado localmente).
```
