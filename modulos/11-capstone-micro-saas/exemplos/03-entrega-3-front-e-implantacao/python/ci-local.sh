#!/usr/bin/env bash
# Os MESMOS passos do job "api-python" do ci.yml (+ build da imagem Python), rodados localmente.
# Rode a partir da pasta do módulo: bash exemplos/03-entrega-3-front-e-implantacao/python/ci-local.sh
set -euo pipefail
passo() { echo; echo "==== $1"; }
passo "1/4 uv sync --frozen";       uv sync --frozen 2>&1 | tail -1
passo "2/4 lint (ruff)";            uv run ruff check . && echo "lint ok"
passo "3/4 testes (pytest)";        uv run pytest 2>&1 | tail -1
passo "4/4 build da imagem Python"; docker build -q -t m11-politicas-api-py:ci -f app_py/Dockerfile .
docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep -E '^m11-politicas-api-py:ci'
echo; echo "CI local (Python): tudo verde"
