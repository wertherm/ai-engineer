#!/usr/bin/env bash
# A API do vLLM é compatível com a da OpenAI: o mesmo JSON, outro endereço.
set -euo pipefail
URL="${VLLM_URL:-http://localhost:8000}"

echo "== Modelos servidos =="
curl -s "$URL/v1/models" | python3 -c 'import sys,json; print([m["id"] for m in json.load(sys.stdin)["data"]])'

echo "== Chat completion =="
curl -s "$URL/v1/chat/completions" -H 'Content-Type: application/json' -d '{
  "model": "qwen-mini",
  "messages": [
    {"role": "system", "content": "Responda em português, em uma frase."},
    {"role": "user", "content": "O que é um container?"}
  ],
  "max_tokens": 60,
  "temperature": 0
}' | python3 -c 'import sys,json; r=json.load(sys.stdin); print(r["choices"][0]["message"]["content"]); print("uso:", r["usage"])'
