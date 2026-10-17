#!/usr/bin/env bash
# Sobe Ollama + Postgres/pgvector e garante os modelos usados pelos módulos.
# Uso: bash infra/subir-ia.sh   (idempotente; a 1ª vez baixa ~4 GB de modelos)
set -euo pipefail
cd "$(dirname "$0")"
CHAT="${MODELO_CHAT:-qwen3.5:4b}"                 # chat + tools + visão (thinking desligável)
EMBED="${MODELO_EMBED:-qwen3-embedding:0.6b}"     # embeddings de 1024 dimensões, multilíngue

docker compose up -d
echo -n "Aguardando Ollama"
until curl -sf localhost:11434/api/version >/dev/null; do echo -n "."; sleep 2; done; echo
for m in "$CHAT" "$EMBED"; do
  docker compose exec -T ollama ollama list | grep -q "^$m " || docker compose exec -T ollama ollama pull "$m"
done
until docker compose exec -T postgres pg_isready -U ia >/dev/null 2>&1; do sleep 2; done
docker compose exec -T postgres psql -U ia -d ia -qc "CREATE EXTENSION IF NOT EXISTS vector;"
echo "Pronto: Ollama em http://localhost:11434/v1 ($CHAT, $EMBED) · Postgres em postgres://ia:ia@localhost:5433/ia"
