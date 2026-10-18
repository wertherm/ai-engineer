#!/usr/bin/env bash
# MCP Inspector (um client JS) em modo CLI contra os servidores PYTHON: é também o teste de
# interoperabilidade "client JS -> servidor Python".
# Rode a partir da pasta do módulo: bash exemplos/05-testar-e-compor/python/inspector.sh
set -euo pipefail
INSPECTOR=(npx -y @modelcontextprotocol/inspector@2.11.0 --cli)
STDIO=(.venv/bin/python exemplos/01-servidor-stdio/python/server.py)

echo "== stdio: tools/list (nomes)"
"${INSPECTOR[@]}" "${STDIO[@]}" -q --format json --method tools/list | jq -c '[.result.tools[].name]'

echo "== stdio: tools/call somar a=2 b=3"
"${INSPECTOR[@]}" "${STDIO[@]}" -q --format json --method tools/call --tool-name somar --tool-arg a=2 --tool-arg b=3 | jq -c '.result.structuredContent'

echo "== stdio: resources/read saudacao://Ana"
"${INSPECTOR[@]}" "${STDIO[@]}" -q --format json --method resources/read --uri saudacao://Ana | jq -r '.result.contents[0].text'

echo "== stdio: prompts/get revisar_codigo"
"${INSPECTOR[@]}" "${STDIO[@]}" -q --format json --method prompts/get --prompt-name revisar_codigo --prompt-args codigo=x=1 | jq -c '.result.messages[0].content.text'

echo "== stdio: argumento inválido -> exit code diferente de 0 (bom para CI)"
set +e
"${INSPECTOR[@]}" "${STDIO[@]}" -q --method tools/call --tool-name somar --tool-arg a='"dois"' --tool-arg b=3 >/dev/null 2>&1
echo "exit code: $?"
set -e

# Servidor HTTP Python do exemplo 04 em segundo plano; paramos pelo PID no fim.
PORT=30375 RATE_LIMIT=100 .venv/bin/python exemplos/04-mcp-http-producao/python/server.py >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for _ in $(seq 100); do curl -sf http://127.0.0.1:30375/health >/dev/null && break; sleep 0.1; done

echo "== http: tools/list com service token"
"${INSPECTOR[@]}" http://127.0.0.1:30375/mcp --header "Authorization: Bearer tok-ide-demo" -q --format json --method tools/list | jq -c '[.result.tools[].name]'

echo "== http: tools/call consultar_estoque"
"${INSPECTOR[@]}" http://127.0.0.1:30375/mcp --header "Authorization: Bearer tok-ide-demo" -q --format json \
  --method tools/call --tool-name consultar_estoque --tool-arg sku=CAF-002 | jq -r '.result.content[0].text'

echo "== http: sem token -> falha (--stored-auth-only evita o Inspector tentar OAuth interativo no 401)"
set +e
SAIDA=$("${INSPECTOR[@]}" http://127.0.0.1:30375/mcp -q --stored-auth-only --method tools/list 2>&1)
CODIGO=$?
set -e
echo "${SAIDA:0:300}"
echo "exit code: $CODIGO"
