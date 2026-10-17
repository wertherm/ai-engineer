#!/usr/bin/env bash
# Build do front Angular SEM instalar nada no host: o Angular CLI 22 exige Node >= 24.15 e a máquina
# tem 24.11, então o build roda no container oficial node:24.22.0-alpine (o mesmo do Dockerfile e do CI).
# Rode a partir da pasta do módulo: bash exemplos/03-entrega-3-front-e-implantacao/build-web.sh
set -euo pipefail
cd app/web
docker run --rm -u "$(id -u):$(id -g)" -e NG_CLI_ANALYTICS=false -e HOME=/tmp \
  -v "$PWD":/w -w /w node:24.22.0-alpine \
  sh -c "npm ci --no-audit --no-fund --loglevel=error && npx ng build" 2>&1 | grep -Ev '^\s*$|npm notice'
