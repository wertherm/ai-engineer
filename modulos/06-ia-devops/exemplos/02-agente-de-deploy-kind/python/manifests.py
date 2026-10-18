"""Validação da intenção extraída pelo LLM + renderização determinística dos manifests.

O LLM nunca escreve YAML livre aqui: ele preenche um "formulário" (spec) que o código checa e renderiza.
"""
import re

import yaml

# re.ASCII: o \w do Python é Unicode; o do JS não (aceitaria "imagem-ção:1").
DNS1123 = re.compile(r"^[a-z]([-a-z0-9]{0,30}[a-z0-9])?$")
IMAGEM_COM_TAG = re.compile(r"^[\w./-]+:[\w.-]+$", re.ASCII)


def inteiro(x):
    """Equivalente ao Number.isInteger do JS: o json do Python devolve 2.0 como float, e True não é número."""
    return isinstance(x, (int, float)) and not isinstance(x, bool) and float(x).is_integer()


def validar_spec(s):
    """Valida a spec. Devolve lista de erros (vazia = ok). Regras da plataforma, não do modelo."""
    erros = []
    nome, imagem = s.get("nome"), s.get("imagem")
    if not (isinstance(nome, str) and DNS1123.match(nome)):
        erros.append(f'nome "{nome}" não é DNS-1123 (minúsculas, números e hífen)')
    if not (isinstance(imagem, str) and IMAGEM_COM_TAG.match(imagem)):
        erros.append(f'imagem "{imagem}" precisa de tag explícita')
    elif imagem.endswith(":latest"):
        erros.append("tag :latest proibida (deploy não reprodutível)")
    rep, porta, maxr, cpu = (s.get(k) for k in ("replicas", "porta", "maxReplicas", "cpuAlvo"))
    if not inteiro(rep) or not 1 <= rep <= 10:
        erros.append("replicas deve ser 1..10")
    if not inteiro(porta) or not 1024 <= porta <= 65535:
        erros.append("porta deve ser 1024..65535 (container sem root)")
    if not inteiro(maxr) or (inteiro(rep) and maxr < rep) or maxr > 20:
        erros.append("maxReplicas deve ser >= replicas e <= 20")
    if not inteiro(cpu) or not 10 <= cpu <= 95:
        erros.append("cpuAlvo deve ser 10..95 (%)")
    return erros


def renderizar(s, ns):
    """Deployment + Service + HPA (autoscaling/v2) com as boas práticas embutidas no template."""
    nome, porta = s["nome"], int(s["porta"])
    labels = {"app": nome, "app.kubernetes.io/managed-by": "m06-agente-deploy"}
    deployment = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": nome, "namespace": ns, "labels": labels},
        "spec": {
            "replicas": int(s["replicas"]),
            # Sem isto, um deploy quebrado fica "Progressing" por 10 min antes de virar falha.
            "progressDeadlineSeconds": 60,
            "revisionHistoryLimit": 5,  # o rollback precisa de ReplicaSets antigos
            "selector": {"matchLabels": {"app": nome}},
            "strategy": {"type": "RollingUpdate", "rollingUpdate": {"maxUnavailable": 0, "maxSurge": 1}},
            "template": {
                "metadata": {"labels": labels},
                "spec": {
                    "securityContext": {"runAsNonRoot": True, "seccompProfile": {"type": "RuntimeDefault"}},
                    "containers": [{
                        "name": nome,
                        "image": s["imagem"],
                        "imagePullPolicy": "IfNotPresent",
                        "ports": [{"containerPort": porta}],
                        # readiness decide se o pod recebe tráfego; é ela que o rollout status espera.
                        "readinessProbe": {"httpGet": {"path": "/", "port": porta}, "periodSeconds": 3, "failureThreshold": 2},
                        "livenessProbe": {"httpGet": {"path": "/", "port": porta}, "initialDelaySeconds": 5, "periodSeconds": 10},
                        # requests são obrigatórios para o HPA calcular % de CPU.
                        "resources": {"requests": {"cpu": "50m", "memory": "32Mi"}, "limits": {"cpu": "200m", "memory": "64Mi"}},
                        "securityContext": {"allowPrivilegeEscalation": False, "capabilities": {"drop": ["ALL"]}},
                    }],
                },
            },
        },
    }
    service = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": nome, "namespace": ns, "labels": labels},
        "spec": {"selector": {"app": nome}, "ports": [{"port": 80, "targetPort": porta}]},
    }
    hpa = {
        "apiVersion": "autoscaling/v2",
        "kind": "HorizontalPodAutoscaler",
        "metadata": {"name": nome, "namespace": ns, "labels": labels},
        "spec": {
            "scaleTargetRef": {"apiVersion": "apps/v1", "kind": "Deployment", "name": nome},
            "minReplicas": int(s["replicas"]),
            "maxReplicas": int(s["maxReplicas"]),
            "metrics": [{"type": "Resource", "resource": {"name": "cpu", "target": {"type": "Utilization", "averageUtilization": int(s["cpuAlvo"])}}}],
        },
    }
    # sort_keys=False mantém a ordem legível (apiVersion, kind, metadata...); safe_dump_all separa com "---".
    return yaml.safe_dump_all([deployment, service, hpa], sort_keys=False, allow_unicode=True)
