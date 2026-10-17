// Pipeline determinístico de validação de IaC: é ele, não o LLM, quem decide se o código serve.
// fmt (corrige sozinho) → init → validate → plan → show -json → conftest (OPA).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { run } from '../../comum/shell.js';

// Cache de providers compartilhado entre execuções (baixa o hashicorp/local e o random uma vez só) e o
// diretório de dados do tofu (.terraform) ficam FORA do repositório: são binários de terceiros.
const BASE_CACHE = path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'ai-engineer-m06');
const CACHE = path.join(BASE_CACHE, 'tofu-plugins');

/**
 * Valida um main.tf num diretório de trabalho. Devolve { ok, etapa, erros[], recursos[] }.
 * `politicas` é a lista de diretórios .rego passados ao conftest.
 */
export async function validarIac(hcl, { dir, politicas }) {
  await mkdir(dir, { recursive: true });
  await mkdir(CACHE, { recursive: true });
  await writeFile(path.join(dir, 'main.tf'), hcl);
  const dataDir = path.join(BASE_CACHE, 'tofu-data', createHash('sha1').update(path.resolve(dir)).digest('hex').slice(0, 12));
  const env = { TF_PLUGIN_CACHE_DIR: CACHE, TF_DATA_DIR: dataDir, TF_IN_AUTOMATION: '1' };
  const tofu = (args) => run('tofu', args, { cwd: dir, env });

  // 1. Formatação é problema determinístico: corrige com a ferramenta, não gasta token do LLM.
  const fmt = await tofu(['fmt', '-check', '-list=true']);
  if (!fmt.ok) await tofu(['fmt']);
  const formatado = !fmt.ok;

  // 2. init: resolve e baixa providers (do cache). Erro aqui = provider/versão inventados.
  // -upgrade: se o LLM mudar a restrição de versão entre tentativas, o lock antigo não trava o init.
  const init = await tofu(['init', '-input=false', '-no-color', '-upgrade']);
  if (!init.ok) return falha('init', [ultimasLinhas(init.stderr || init.stdout)]);

  // 3. validate -json: erros de sintaxe, argumentos que não existem no schema do provider etc.
  const val = await tofu(['validate', '-json', '-no-color']);
  const vj = JSON.parse(val.stdout || '{}');
  if (!vj.valid) {
    const erros = vj.diagnostics.map((d) => `${d.summary}: ${d.detail ?? ''} (linha ${d.range?.start?.line ?? '?'})`);
    // Grounding vindo da ferramenta: se o modelo inventou argumento, devolvemos a lista REAL de argumentos
    // do schema do provider (`tofu providers schema -json`). Só "não existe" não basta para um modelo pequeno.
    if (erros.some((e) => /^(Unsupported argument|Incorrect attribute value type)/.test(e))) erros.push(...(await argumentosValidos(tofu, hcl)));
    return falha('validate', erros);
  }

  // 4. plan + show -json: a política roda sobre o que VAI acontecer, não sobre o texto.
  const plan = await tofu(['plan', '-input=false', '-no-color', '-out=plan.bin']);
  if (!plan.ok) return falha('plan', [ultimasLinhas(plan.stderr)]);
  const show = await tofu(['show', '-json', 'plan.bin']);
  await writeFile(path.join(dir, 'plan.json'), show.stdout);
  const planJson = JSON.parse(show.stdout);
  const recursos = (planJson.resource_changes ?? []).map((r) => `${r.change.actions.join('/')} ${r.address}`);

  // 5. Policy-as-Code: conftest avalia as regras `deny` do Rego contra o plano.
  const args = ['test', 'plan.json', '--no-color', '-o', 'json', ...politicas.flatMap((p) => ['-p', p])];
  const ct = await run('conftest', args, { cwd: dir });
  const resultado = JSON.parse(ct.stdout || '[]');
  const negadas = resultado.flatMap((r) => (r.failures ?? []).map((f) => f.msg));
  if (negadas.length) return { ok: false, etapa: 'conftest', erros: negadas, recursos, formatado };

  return { ok: true, etapa: 'ok', erros: [], recursos, formatado, hclFinal: await readFile(path.join(dir, 'main.tf'), 'utf8') };

  function falha(etapa, erros) {
    return { ok: false, etapa, erros, recursos: [], formatado };
  }
}

/** Para cada tipo de recurso usado no HCL, lista os argumentos configuráveis segundo o schema do provider. */
async function argumentosValidos(tofu, hcl) {
  const sch = await tofu(['providers', 'schema', '-json']);
  if (!sch.ok) return [];
  const provedores = JSON.parse(sch.stdout).provider_schemas ?? {};
  const tipos = new Set([...hcl.matchAll(/resource\s+"([\w-]+)"/g)].map((m) => m[1]));
  const dicas = [];
  for (const p of Object.values(provedores)) {
    for (const [tipo, r] of Object.entries(p.resource_schemas ?? {})) {
      if (!tipos.has(tipo)) continue;
      const args = Object.entries(r.block.attributes ?? {}).filter(([, a]) => a.required || a.optional)
        .map(([n, a]) => `${n} (${Array.isArray(a.type) ? a.type[0] : a.type})`); // o tipo evita "min_upper = true"
      dicas.push(`Argumentos válidos de ${tipo}: ${args.join(', ')}`);
    }
  }
  return dicas;
}

// O tofu repete o mesmo diagnóstico às vezes: deduplicamos para não gastar token do LLM com eco.
const ultimasLinhas = (t, n = 8) => [...new Set(t.trim().split('\n').map((l) => l.trim()).filter(Boolean))].slice(-n).join(' | ');
