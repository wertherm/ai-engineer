#!/usr/bin/env bash
# Simula no kind as duas regras do OpenShift que mais quebram imagens (SCC restricted-v2):
#  1. Pod Security "restricted": sem capabilities extras, sem hostPath, runAsNonRoot, seccomp.
#  2. UID arbitrário: o OpenShift roda o container com um UID sorteado da faixa do projeto e grupo 0.
# Não substitui um OpenShift de verdade (não há Route, SCC nem ServiceMonitor no kind).
set -euo pipefail
cd "$(dirname "$0")"

kubectl delete ns llmops --ignore-not-found --wait
kubectl create ns llmops
kubectl label ns llmops pod-security.kubernetes.io/enforce=restricted

echo "== 1. O manifest 'Kubernetes puro' viola a política (só aviso, porque é dry-run de Deployment):"
saida=$(kubectl apply --dry-run=server -f ../k8s/02-deployment.yaml 2>&1)  # sem pipe direto: head + pipefail = SIGPIPE
echo "${saida%%$'\n'*}" | cut -c1-160

echo "== 2. O manifest adaptado ao OpenShift passa:"
kubectl -n llmops apply -f 01-pvc.yaml -f 02-deployment.yaml -f 03-service.yaml
# Aqui fazemos à mão o que a SCC faria sozinha: UID 1000850000 (exemplo de faixa) e grupo 0.
kubectl -n llmops patch deploy vllm --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/securityContext","value":{"runAsUser":1000850000,"runAsGroup":0,"fsGroup":1000850000}}]'
kubectl -n llmops rollout status deploy/vllm --timeout=600s
kubectl -n llmops exec deploy/vllm -- id
