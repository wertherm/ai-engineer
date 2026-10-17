// Toolbox SOMENTE LEITURA do agente de troubleshooting. Cada tool devolve texto curto e já filtrado:
// mandar o `kubectl describe` inteiro (~120 linhas) ao modelo pequeno custa minutos de prefill na CPU.
import { kubectl, cortar } from '../../comum/shell.js';

export const NS = 'm06-troubleshoot';

async function podJson(nome) {
  const r = await kubectl(['-n', NS, 'get', 'pod', nome, '-o', 'json']);
  if (!r.ok) throw new Error(`pod ${nome} não encontrado`);
  return JSON.parse(r.stdout);
}

export const ferramentas = {
  descrever_pod: {
    descricao: 'Estado do container (waiting/terminated, motivo, exit code), restarts, limites de recurso e os últimos eventos do pod.',
    parametros: { nome: { type: 'string', description: 'nome do pod' } },
    async executar({ nome }) {
      const p = await podJson(nome);
      const c = p.status.containerStatuses?.[0] ?? {};
      const spec = p.spec.containers[0];
      const ev = await kubectl(['-n', NS, 'get', 'events', '--field-selector', `involvedObject.name=${nome}`,
        '--sort-by=.lastTimestamp', '-o', 'custom-columns=TIPO:.type,MOTIVO:.reason,MSG:.message', '--no-headers']);
      return JSON.stringify({
        imagem: spec.image,
        estadoAtual: Object.entries(c.state ?? {}).map(([tipo, v]) => ({
          tipo, reason: v.reason, exitCode: v.exitCode, message: v.message?.slice(0, 160),
        }))[0],
        ultimoTermino: c.lastState?.terminated
          ? { reason: c.lastState.terminated.reason, exitCode: c.lastState.terminated.exitCode } : null,
        restarts: c.restartCount ?? 0,
        limites: spec.resources?.limits ?? 'nenhum',
        eventos: ev.stdout.trim().split('\n').slice(-4).map((l) => l.replace(/\s+/g, ' ').slice(0, 160)),
      });
    },
  },
  logs_pod: {
    descricao: 'Últimas linhas de log do container (da execução atual ou, se não houver, da anterior).',
    parametros: { nome: { type: 'string', description: 'nome do pod' } },
    async executar({ nome }) {
      // Em CrashLoopBackOff o container atual costuma estar "terminated" e é ELE que tem o log;
      // o --previous aponta para uma execução mais antiga que o kubelet já pode ter coletado.
      for (const extra of [[], ['--previous']]) {
        const r = await kubectl(['-n', NS, 'logs', nome, '--tail=15', ...extra]);
        if (r.ok && r.stdout.trim()) return cortar(r.stdout.trim(), 15);
      }
      return '(sem logs: o container nunca chegou a rodar ou os logs já foram coletados)';
    },
  },
};

/** Schema OpenAI (function calling) gerado a partir da toolbox. */
export const toolsSchema = Object.entries(ferramentas).map(([name, f]) => ({
  type: 'function',
  function: {
    name,
    description: f.descricao,
    parameters: { type: 'object', properties: f.parametros, required: ['nome'] },
  },
}));

/**
 * Baseline determinístico (regras): lê o mesmo estado que o agente e classifica sem LLM.
 * Serve de "gabarito barato" para comparar com o agente: se regras resolvem, o LLM só explica.
 */
export async function classificarPorRegra(nome) {
  const c = (await podJson(nome)).status.containerStatuses?.[0] ?? {};
  const waiting = c.state?.waiting?.reason;
  const term = c.lastState?.terminated?.reason ?? c.state?.terminated?.reason;
  if (['ImagePullBackOff', 'ErrImagePull'].includes(waiting)) return 'ImagePullBackOff';
  if (term === 'OOMKilled') return 'OOMKilled';
  if (waiting === 'CrashLoopBackOff' || term === 'Error') return 'CrashLoopBackOff';
  return 'Outro';
}
