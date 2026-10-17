// Validação da intenção extraída pelo LLM + renderização determinística dos manifests.
// O LLM nunca escreve YAML livre aqui: ele preenche um "formulário" (spec) que o código checa e renderiza.
import YAML from 'yaml';

const DNS1123 = /^[a-z]([-a-z0-9]{0,30}[a-z0-9])?$/;

/** Valida a spec. Devolve lista de erros (vazia = ok). Regras da plataforma, não do modelo. */
export function validarSpec(s) {
  const erros = [];
  if (!DNS1123.test(s.nome ?? '')) erros.push(`nome "${s.nome}" não é DNS-1123 (minúsculas, números e hífen)`);
  if (!/^[\w./-]+:[\w.-]+$/.test(s.imagem ?? '')) erros.push(`imagem "${s.imagem}" precisa de tag explícita`);
  else if (s.imagem.endsWith(':latest')) erros.push('tag :latest proibida (deploy não reprodutível)');
  if (!Number.isInteger(s.replicas) || s.replicas < 1 || s.replicas > 10) erros.push('replicas deve ser 1..10');
  if (!Number.isInteger(s.porta) || s.porta < 1024 || s.porta > 65535) erros.push('porta deve ser 1024..65535 (container sem root)');
  if (!Number.isInteger(s.maxReplicas) || s.maxReplicas < s.replicas || s.maxReplicas > 20) erros.push('maxReplicas deve ser >= replicas e <= 20');
  if (!Number.isInteger(s.cpuAlvo) || s.cpuAlvo < 10 || s.cpuAlvo > 95) erros.push('cpuAlvo deve ser 10..95 (%)');
  return erros;
}

/** Deployment + Service + HPA (autoscaling/v2) com as boas práticas embutidas no template. */
export function renderizar(s, ns) {
  const labels = { app: s.nome, 'app.kubernetes.io/managed-by': 'm06-agente-deploy' };
  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: s.nome, namespace: ns, labels },
    spec: {
      replicas: s.replicas,
      // Sem isto, um deploy quebrado fica "Progressing" por 10 min antes de virar falha.
      progressDeadlineSeconds: 60,
      revisionHistoryLimit: 5, // o rollback precisa de ReplicaSets antigos
      selector: { matchLabels: { app: s.nome } },
      strategy: { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
      template: {
        metadata: { labels },
        spec: {
          securityContext: { runAsNonRoot: true, seccompProfile: { type: 'RuntimeDefault' } },
          containers: [{
            name: s.nome,
            image: s.imagem,
            imagePullPolicy: 'IfNotPresent',
            ports: [{ containerPort: s.porta }],
            // readiness decide se o pod recebe tráfego; é ela que o rollout status espera.
            readinessProbe: { httpGet: { path: '/', port: s.porta }, periodSeconds: 3, failureThreshold: 2 },
            livenessProbe: { httpGet: { path: '/', port: s.porta }, initialDelaySeconds: 5, periodSeconds: 10 },
            // requests são obrigatórios para o HPA calcular % de CPU.
            resources: { requests: { cpu: '50m', memory: '32Mi' }, limits: { cpu: '200m', memory: '64Mi' } },
            securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] } },
          }],
        },
      },
    },
  };
  const service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: s.nome, namespace: ns, labels },
    spec: { selector: { app: s.nome }, ports: [{ port: 80, targetPort: s.porta }] },
  };
  const hpa = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: { name: s.nome, namespace: ns, labels },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: s.nome },
      minReplicas: s.replicas,
      maxReplicas: s.maxReplicas,
      metrics: [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: s.cpuAlvo } } }],
    },
  };
  return [deployment, service, hpa].map((o) => YAML.stringify(o)).join('---\n');
}
