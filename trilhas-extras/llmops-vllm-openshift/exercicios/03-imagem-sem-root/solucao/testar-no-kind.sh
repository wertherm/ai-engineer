#!/usr/bin/env bash
# Verifica a solução no kind simulando o OpenShift: Pod Security "restricted" + UID aleatório com grupo 0.
set -euo pipefail
cd "$(dirname "$0")"
NS=exercicio-03
UID_OCP='{"runAsUser":1000870000,"runAsGroup":0,"fsGroup":1000870000}'

kubectl delete ns "$NS" --ignore-not-found --wait >/dev/null
kubectl create ns "$NS" >/dev/null
kubectl label ns "$NS" pod-security.kubernetes.io/enforce=restricted >/dev/null

# A Route não existe no kind: aplicamos só Deployment e Service.
python3 -c 'import sys;print("---".join(d for d in open("site.yaml").read().split("---") if "kind: Route" not in d))' \
  | kubectl -n "$NS" apply -f -
kubectl -n "$NS" patch deploy site --type=json -p="[{\"op\":\"add\",\"path\":\"/spec/template/spec/securityContext\",\"value\":$UID_OCP}]"
kubectl -n "$NS" rollout status deploy/site --timeout=120s
kubectl -n "$NS" exec deploy/site -- id
kubectl -n "$NS" run curl --rm -i --restart=Never --image=docker.io/curlimages/curl:8.17.0 \
  --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":1000870001,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"curl","image":"docker.io/curlimages/curl:8.17.0","args":["-s","-o","/dev/null","-w","HTTP %{http_code}\\n","http://site"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}}}]}}'
kubectl delete ns "$NS" --wait >/dev/null
