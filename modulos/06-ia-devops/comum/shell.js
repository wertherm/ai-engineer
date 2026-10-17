// Execução de ferramentas determinísticas (tofu, conftest, kubectl, trivy, docker).
// Sempre com argv em array (execFile, sem shell): o LLM nunca consegue injetar "; rm -rf".
import { execFile } from 'node:child_process';

/** Roda um binário e devolve { ok, code, stdout, stderr } sem lançar exceção. */
export function run(bin, args, { cwd, input, timeoutMs = 300_000, env } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
      },
    );
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

// Todo kubectl do módulo fala SÓ com o cluster kind de estudo (nunca com o contexto "atual" da máquina).
export const KCTX = process.env.KUBE_CONTEXT ?? 'kind-estudo';
export const kubectl = (args, opts) => run('kubectl', ['--context', KCTX, ...args], opts);

/** Primeiras n linhas de um texto (para não estourar o contexto do LLM). */
export const cortar = (texto, n = 20) => texto.split('\n').slice(0, n).join('\n');
