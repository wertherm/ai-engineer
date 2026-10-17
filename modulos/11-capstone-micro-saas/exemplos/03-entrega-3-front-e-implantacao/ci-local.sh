#!/usr/bin/env bash
# Os MESMOS passos do pipeline (ci.yml), rodados localmente: instalar, lint, testes, build do front e das
# imagens. O deploy (push para registry + atualização do ambiente) fica de fora: não executado localmente.
# Rode a partir da pasta do módulo: bash exemplos/03-entrega-3-front-e-implantacao/ci-local.sh
set -euo pipefail
passo() { echo; echo "==== $1"; }
passo "1/5 npm ci";              npm ci --no-audit --no-fund --loglevel=error
passo "2/5 lint (eslint)";       npx eslint app exemplos exercicios && echo "lint ok"
passo "3/5 testes (vitest)";     npm test 2>&1 | grep -E 'Test Files|Tests '
passo "4/5 build do front";      bash exemplos/03-entrega-3-front-e-implantacao/build-web.sh | grep -E 'Initial total|complete|ERROR'
passo "5/5 build das imagens";   docker build -q -t m11-politicas-api:ci -f app/Dockerfile . && docker build -q -t m11-politicas-web:ci app/web
docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep -E '^m11-politicas-(api|web):ci'
echo; echo "CI local: tudo verde"
