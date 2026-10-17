#!/usr/bin/env bash
# Cria um cluster Kubernetes local (kind = "Kubernetes IN Docker") e carrega a imagem do vLLM nele.
set -euo pipefail
CLUSTER="estudo"
IMAGEM="vllm/vllm-openai-cpu:v0.31.0-x86_64"

if kind get clusters | grep -qx "$CLUSTER"; then
  echo "cluster $CLUSTER já existe"
else
  # extraMounts: o cache do Hugging Face da sua máquina aparece dentro do nó do kind em /hf-cache.
  # Assim o pod não baixa o modelo de novo (o kind não expande "~", por isso o $HOME).
  kind create cluster --name "$CLUSTER" --config - <<YAML
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraMounts:
      - hostPath: $HOME/.cache/huggingface
        containerPath: /hf-cache
YAML
fi

# O nó do kind não enxerga as imagens do seu Docker: é preciso copiar (~6,7 GB, leva alguns minutos).
kind load docker-image "$IMAGEM" --name "$CLUSTER"
kubectl cluster-info --context "kind-$CLUSTER"
