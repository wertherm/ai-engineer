#!/usr/bin/env bash
# Para e remove o container do vLLM (o modelo continua em ~/.cache/huggingface).
docker rm -f vllm-estudo >/dev/null 2>&1 && echo "vLLM parado." || echo "vLLM não estava rodando."
