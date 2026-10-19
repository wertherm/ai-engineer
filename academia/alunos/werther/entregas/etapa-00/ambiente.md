# Ambiente · Missão 0

**Data:** 2026-10-19

## Sistema

- Ubuntu 24.04.3 LTS (kernel Linux 7.0.0-34-generic)
- Node v24.11.1 · git 2.43.0 · Docker 29.5.3

## Como subi o endpoint

Ollama e Postgres/pgvector do repositório, via Docker Compose, na raiz:

```bash
bash infra/subir-ia.sh
```

Endpoint compatível com a OpenAI em `http://localhost:11434/v1`, sem chave. Os modelos `qwen3.5:4b` (chat) e
`qwen3-embedding:0.6b` (embeddings) já estavam baixados, então não houve download. Nenhuma variável exportada: o script
usa os padrões do repositório.

## Saída de `checar-ambiente.mjs`

```text
Missão 0 · checagem de ambiente
endpoint: http://localhost:11434/v1
modelo  : qwen3.5:4b

[ok]     CA1 · Node 22 ou superior — Node v24.11.1
[ok]     GIT · git instalado — git version 2.43.0
[ok]     MODELOS · lista de modelos (/models) — qwen3.5:4b disponível (2 modelos)
[ok]     CA2 · chamada de chat responde com `usage` — qwen3.5:4b · prompt_tokens=18 completion_tokens=2 · 6268 ms

Ambiente pronto para a Lição 1.
```
