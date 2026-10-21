#!/usr/bin/env node
// Roda os testes da Academia em dois grupos, para o dia a dia não esperar minutos:
//
//   node academia/ferramentas/testar.mjs            # rápidos: academia/**/*.test.mjs (cerca de 1 a 2 minutos no Windows)
//   node academia/ferramentas/testar.mjs --lentos   # lentos:  academia/**/*.lento.mjs (3 a 10 minutos)
//   node academia/ferramentas/testar.mjs --tudo     # os dois grupos (é o que o CI deve rodar)
//
// Um teste é "lento" quando executa programas de verdade (verificadores que rodam o código do aluno contra um
// servidor falso). Esses arquivos terminam em `.lento.mjs` e NÃO em `.test.mjs`: assim o comando de sempre,
// `node --test "academia/**/*.test.mjs"`, continua rápido e não os pega por engano. Sem dependências; funciona igual
// em bash, PowerShell e no CI (não usa shell).
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ehPrincipal } from './comum.mjs';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GLOB_RAPIDOS = 'academia/**/*.test.mjs';
export const GLOB_LENTOS = 'academia/**/*.lento.mjs';
export const SUFIXO_LENTO = '.lento.mjs';

const AJUDA = `Uso: node academia/ferramentas/testar.mjs [--rapidos | --lentos | --tudo]

  (sem opção) / --rapidos   ${GLOB_RAPIDOS}   cerca de 1 a 2 minutos
  --lentos                  ${GLOB_LENTOS}   3 a 10 minutos (executam programas de verdade)
  --tudo                    os dois grupos (o que um CI deve rodar)`;

/** Globs de cada modo. Quem chama decide o modo; um modo desconhecido é erro, nunca "rodar o padrão". */
export function globsDoModo(modo) {
  if (modo === 'rapidos') return [GLOB_RAPIDOS];
  if (modo === 'lentos') return [GLOB_LENTOS];
  if (modo === 'tudo') return [GLOB_RAPIDOS, GLOB_LENTOS];
  throw new Error(`modo desconhecido: ${modo}`);
}

/** Lê os argumentos. No máximo um modo; qualquer outra coisa é erro (um `--lento` com erro de digitação não roda o rápido em silêncio). */
export function lerModo(args) {
  const modos = { '--rapidos': 'rapidos', '--lentos': 'lentos', '--tudo': 'tudo' };
  let modo = null;
  for (const a of args) {
    if (!(a in modos)) throw new Error(`opção desconhecida: ${a}`);
    if (modo && modo !== modos[a]) throw new Error('escolha só um modo: --rapidos, --lentos ou --tudo');
    modo = modos[a];
  }
  return modo ?? 'rapidos';
}

export function main(argv) {
  if (argv.includes('--help') || argv.includes('ajuda')) { console.log(AJUDA); return 0; }
  let modo;
  try { modo = lerModo(argv); } catch (e) { console.error(`erro: ${e.message}\n\n${AJUDA}`); return 2; }
  const r = spawnSync(process.execPath, ['--test', ...globsDoModo(modo)], { cwd: RAIZ, stdio: 'inherit' });
  if (r.error) { console.error(`erro: não consegui rodar o Node: ${r.error.message}`); return 1; }
  return r.status ?? 1;
}

if (ehPrincipal(import.meta.url)) process.exitCode = main(process.argv.slice(2));
