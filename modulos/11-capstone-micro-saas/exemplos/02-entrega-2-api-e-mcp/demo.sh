#!/usr/bin/env bash
# Entrega 2 · API documentada (OpenAPI) e funcional. Sobe a API, exercita o contrato com curl,
# exporta o openapi.json e para o servidor pelo PID. Rode a partir da pasta do módulo:
#   bash exemplos/02-entrega-2-api-e-mcp/demo.sh
set -euo pipefail
PORTA=31121
API=http://127.0.0.1:$PORTA
ACME=(-H "Authorization: Bearer sk-acme-demo")
PADARIA=(-H "Authorization: Bearer sk-padaria-demo")
JSON=(-H "content-type: application/json")
AQUI=exemplos/02-entrega-2-api-e-mcp

PORT=$PORTA LOG_LEVEL=warn node app/src/server.js >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for _ in $(seq 100); do curl -sf $API/health >/dev/null && break; sleep 0.1; done

echo "== GET /openapi.json (contrato) -> $AQUI/openapi.json"
curl -s $API/openapi.json | jq . > $AQUI/openapi.json
jq -r '.paths | to_entries[] | .key as $p | .value | keys[] | "  \(ascii_upcase) \($p)"' $AQUI/openapi.json
echo "  (Swagger UI interativa em $API/docs enquanto o servidor estiver no ar)"

echo "== GET /v1/me com cada API key"
curl -s "${ACME[@]}" $API/v1/me; echo
curl -s "${PADARIA[@]}" $API/v1/me; echo

echo "== erros do contrato: 401 sem chave · 400 validação · 404 documento inexistente"
curl -s -o /dev/null -w "  %{http_code}\n" $API/v1/me
curl -s -o /dev/null -w "  %{http_code}\n" "${ACME[@]}" "${JSON[@]}" -d '{"pergunta":"x"}' $API/v1/perguntas
curl -s -o /dev/null -w "  %{http_code}\n" "${ACME[@]}" -X DELETE $API/v1/documentos/nao-existe.md

echo "== POST /v1/documentos (padaria envia uma política nova) e DELETE em seguida"
curl -s "${PADARIA[@]}" "${JSON[@]}" $API/v1/documentos \
  -d '{"fonte":"vale-transporte.md","texto":"# Vale-transporte (Padaria Pão Quente)\n\nO vale-transporte é pago no 1º dia útil do mês, com desconto de 6% do salário.\n\nQuem mora a menos de 1 km da padaria não recebe vale-transporte."}'; echo
curl -s "${PADARIA[@]}" "${JSON[@]}" $API/v1/busca -d '{"consulta":"quando o vale-transporte é pago?","k":1}' | jq -c '.[] | {fonte, sim: (.sim*1000|round/1000)}'
curl -s "${PADARIA[@]}" -X DELETE $API/v1/documentos/vale-transporte.md; echo

echo "== POST /v1/perguntas (RAG + LLM; lento em CPU)"
time curl -s "${ACME[@]}" "${JSON[@]}" $API/v1/perguntas -d '{"pergunta":"Qual o valor do auxílio home office?"}' \
  | jq -c '{resposta, citacoes: [.citacoes[] | .fonte], verificado, cache, tokens}'
