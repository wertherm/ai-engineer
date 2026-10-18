#!/usr/bin/env bash
# (versão Python) Valida o servidor MCP da API Python (app_py) com o MCP Inspector em modo CLI (sem UI), do jeito que um CI faria.
# Sobe a API numa porta própria, roda as chamadas e para o servidor pelo PID.
# O MESMO roteiro do inspector.sh, só que contra a porta Python 31152.
# Rode a partir da pasta do módulo: bash exemplos/02-entrega-2-api-e-mcp/python/inspector.sh
set -euo pipefail
PORTA=${PORTA:-31152}
URL=http://127.0.0.1:$PORTA/mcp
INSPECTOR=(npx -y @modelcontextprotocol/inspector@2.11.0 --cli)

PORT=$PORTA LOG_LEVEL=warning uv run python -m app_py.server >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for _ in $(seq 150); do curl -sf http://127.0.0.1:$PORTA/health >/dev/null && break; sleep 0.2; done

echo "== tools/list (tenant acme)"
"${INSPECTOR[@]}" "$URL" --header "Authorization: Bearer sk-acme-demo" -q --format json --method tools/list \
  | jq -c '[.result.tools[] | {name, readOnly: .annotations.readOnlyHint}]'

echo "== tools/call buscar_politicas (acme): 'auxílio home office'"
"${INSPECTOR[@]}" "$URL" --header "Authorization: Bearer sk-acme-demo" -q --format json \
  --method tools/call --tool-name buscar_politicas --tool-arg consulta="auxílio home office" --tool-arg k=1 \
  | jq -c '.result.structuredContent.itens[0] | {fonte, similaridade, trecho: .trecho[0:70]}'

echo "== mesma busca com a chave da padaria: isolamento por tenant"
"${INSPECTOR[@]}" "$URL" --header "Authorization: Bearer sk-padaria-demo" -q --format json \
  --method tools/call --tool-name buscar_politicas --tool-arg consulta="auxílio home office" --tool-arg k=1 \
  | jq -c '.result.structuredContent.itens[0] | {fonte, similaridade}'

echo "== tools/call listar_documentos (padaria)"
"${INSPECTOR[@]}" "$URL" --header "Authorization: Bearer sk-padaria-demo" -q --format json \
  --method tools/call --tool-name listar_documentos | jq -c '[.result.structuredContent.itens[].fonte]'

echo "== argumento inválido (k=99) -> isError e exit code != 0 (o CI falha se uma tool quebrar)"
set +e
SAIDA=$("${INSPECTOR[@]}" "$URL" --header "Authorization: Bearer sk-acme-demo" -q --format json \
  --method tools/call --tool-name buscar_politicas --tool-arg consulta=ferias --tool-arg k=99 2>/dev/null)
CODIGO=$?
set -e
echo "$SAIDA" | jq -c 'select(.result) | {isError: .result.isError, msg: .result.content[0].text[0:80]}'
echo "exit code: $CODIGO"

echo "== sem API key -> 401 (--stored-auth-only evita o Inspector tentar OAuth interativo)"
set +e
SAIDA=$("${INSPECTOR[@]}" "$URL" -q --stored-auth-only --method tools/list 2>&1)
CODIGO=$?
set -e
echo "${SAIDA:0:160}"
echo "exit code: $CODIGO"
