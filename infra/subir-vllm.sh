#!/usr/bin/env bash
# Sobe o vLLM em CPU via Docker e espera o /health responder.
# Uso: bash infra/subir-vllm.sh   (idempotente: se já estiver no ar, só confirma)
set -euo pipefail

IMAGEM="vllm/vllm-openai-cpu:v0.31.0-x86_64"   # versão fixada: o repo foi verificado com ela
MODELO="Qwen/Qwen2.5-0.5B-Instruct"             # ~1 GB em BF16, sem gated access no Hugging Face
NOME="vllm-estudo"

if curl -sf localhost:8000/health >/dev/null; then
  echo "vLLM já está no ar em http://localhost:8000"; exit 0
fi

docker rm -f "$NOME" >/dev/null 2>&1 || true
mkdir -p ~/.cache/huggingface

# --shm-size, SYS_NICE e seccomp=unconfined: recomendações da doc de CPU do vLLM
#   (sem eles aparece "get_mempolicy: Operation not permitted" e perde performance).
# VLLM_CPU_KVCACHE_SPACE=2  -> 2 GiB de KV cache (cabe numa máquina de 15 GB).
# VLLM_CPU_OMP_THREADS_BIND -> núcleos 0-5 para a inferência, 6-7 livres para o servidor e o SO.
docker run -d --name "$NOME" -p 8000:8000 --shm-size=4g \
  --cap-add SYS_NICE --security-opt seccomp=unconfined \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e VLLM_CPU_KVCACHE_SPACE=2 -e VLLM_CPU_OMP_THREADS_BIND=0-5 \
  "$IMAGEM" "$MODELO" \
  --dtype bfloat16 --max-model-len 4096 --served-model-name qwen-mini >/dev/null

echo -n "Aguardando o vLLM (1ª vez baixa o modelo; subir + aquecer leva ~4 min em CPU)"
for _ in $(seq 1 120); do
  if curl -sf localhost:8000/health >/dev/null; then
    echo; echo "vLLM no ar em http://localhost:8000 (modelo: qwen-mini)"
    # Aquecimento: a 1ª requisição compila kernels e pode levar ~2 min em CPU.
    echo "Aquecendo (1ª requisição)..."
    curl -s localhost:8000/v1/completions -H 'Content-Type: application/json' \
      -d '{"model":"qwen-mini","prompt":"oi","max_tokens":1}' >/dev/null
    echo "Pronto."; exit 0
  fi
  echo -n "."; sleep 5
done
echo; echo "vLLM não subiu. Veja: docker logs $NOME" >&2; exit 1
