// Checklist de governança automatizado: audita uma pasta de projeto e devolve evidências por item.
// Cada verificação é uma função pura (pasta) -> { ok, evidencia }. Nada de LLM: auditoria precisa ser reproduzível.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ler = (p) => readFileSync(p, 'utf8');
const arquivos = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (['node_modules', '.git'].includes(n)) return [];
  return statSync(p).isDirectory() ? arquivos(p) : [p];
});

export const VERIFICACOES = [
  {
    id: 'GOV-01', titulo: 'README e CHANGELOG presentes',
    rodar: (d) => {
      const falta = ['README.md', 'CHANGELOG.md'].filter((f) => !existsSync(join(d, f)));
      return { ok: falta.length === 0, evidencia: falta.length ? `faltando: ${falta.join(', ')}` : 'ambos presentes' };
    },
  },
  {
    id: 'GOV-02', titulo: 'Versão do package.json registrada no CHANGELOG (controle de versão)',
    rodar: (d) => {
      const { version } = JSON.parse(ler(join(d, 'package.json')));
      const log = existsSync(join(d, 'CHANGELOG.md')) ? ler(join(d, 'CHANGELOG.md')) : '';
      const ok = log.includes(`[${version}]`);
      return { ok, evidencia: ok ? `versão ${version} documentada` : `versão ${version} não aparece no CHANGELOG` };
    },
  },
  {
    id: 'GOV-03', titulo: 'Dependências com versão exata (build reproduzível)',
    rodar: (d) => {
      const pkg = JSON.parse(ler(join(d, 'package.json')));
      const soltas = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([, v]) => /^[\^~*]|^latest$|[<>]/.test(v));
      return { ok: soltas.length === 0, evidencia: soltas.length ? soltas.map(([n, v]) => `${n}@${v}`).join(', ') : 'todas exatas' };
    },
  },
  {
    id: 'GOV-04', titulo: 'ADRs com Status, Data e Decisores (trilha de decisão)',
    rodar: (d) => {
      const dir = join(d, 'docs/adr');
      if (!existsSync(dir)) return { ok: false, evidencia: 'sem docs/adr' };
      const incompletos = readdirSync(dir).filter((f) => f.endsWith('.md'))
        .filter((f) => !['Status:', 'Data:', 'Decisores:'].every((c) => ler(join(dir, f)).includes(c)));
      return { ok: incompletos.length === 0, evidencia: incompletos.length ? `incompletos: ${incompletos.join(', ')}` : 'todos completos' };
    },
  },
  {
    id: 'GOV-05', titulo: 'Rastreabilidade: todo requisito citado em algum teste',
    rodar: (d) => {
      const req = join(d, 'docs/requisitos.md');
      if (!existsSync(req)) return { ok: false, evidencia: 'sem docs/requisitos.md' };
      const ids = [...new Set(ler(req).match(/HU-\d+/g) ?? [])];
      const testes = arquivos(d).filter((f) => /\.test\.[jt]s$/.test(f)).map(ler).join('\n');
      const semTeste = ids.filter((id) => !testes.includes(id));
      return { ok: semTeste.length === 0, evidencia: semTeste.length ? `sem teste: ${semTeste.join(', ')}` : `${ids.length} requisitos cobertos` };
    },
  },
  {
    id: 'GOV-06', titulo: 'Sem segredo fixo no código',
    rodar: (d) => {
      const padrao = /(api[_-]?key|secret|password|senha|token)\s*[:=]\s*['"][^'"]{8,}['"]/i;
      const achados = arquivos(d).filter((f) => /\.(js|ts|json|env)$/.test(f) && padrao.test(ler(f))).map((f) => relative(d, f));
      return { ok: achados.length === 0, evidencia: achados.length ? `possível segredo em: ${achados.join(', ')}` : 'nada encontrado' };
    },
  },
  {
    id: 'GOV-07', titulo: 'Tag git da versão atual (se for repositório git)',
    rodar: (d) => {
      if (!existsSync(join(d, '.git'))) return { ok: null, evidencia: 'não é repositório git: verificação pulada' };
      const { version } = JSON.parse(ler(join(d, 'package.json')));
      const tags = execFileSync('git', ['-C', d, 'tag', '--list'], { encoding: 'utf8' }).split('\n');
      const ok = tags.includes(`v${version}`);
      return { ok, evidencia: ok ? `tag v${version} existe` : `tag v${version} ausente` };
    },
  },
];

export function auditar(pasta) {
  return VERIFICACOES.map((v) => ({ id: v.id, titulo: v.titulo, ...v.rodar(pasta) }));
}
