// Lê o corpus de demonstração: app/dados/<tenant>/*.md (um diretório por empresa cliente).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PASTA_DADOS = fileURLToPath(new URL('../dados/', import.meta.url));

export async function lerDocumentos(tenantId, pasta = PASTA_DADOS) {
  const dir = join(pasta, tenantId);
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  return Promise.all(arquivos.map(async (fonte) => ({ fonte, texto: await readFile(join(dir, fonte), 'utf8') })));
}
