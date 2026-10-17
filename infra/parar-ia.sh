#!/usr/bin/env bash
# Para Ollama e Postgres. Modelos e dados ficam nos volumes (use "docker compose down -v" para apagar tudo).
cd "$(dirname "$0")" && docker compose down
