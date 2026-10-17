// Utilitários compartilhados pelas ferramentas e pelos verificadores da Academia (sem dependências).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Verdadeiro se o módulo em `importMetaUrl` é o programa que o Node está executando. Compara os caminhos reais:
 * `import.meta.url` já vem resolvido, mas `process.argv[1]` não (symlinks e junctions fariam o script sair sem fazer nada).
 */
export function ehPrincipal(importMetaUrl) {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}

/** Padrões de segredos que nunca devem ir para o repositório. */
export const SEGREDOS = [
  { nome: 'chave sk-', re: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/ },
  { nome: 'token Bearer', re: /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i },
  { nome: 'token do GitHub', re: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}/ },
  { nome: 'chave da AWS', re: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}/ },
  { nome: 'chave do Google', re: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/ },
  { nome: 'token do Hugging Face', re: /(?<![A-Za-z0-9])hf_[A-Za-z0-9]{30,}/ },
  { nome: 'token do Slack', re: /(?<![A-Za-z0-9])xox[abprs]-[A-Za-z0-9-]{10,}/ },
  { nome: 'chave privada', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { nome: 'URL com usuário e senha', re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i },
  { nome: 'segredo na query string', re: /[?&](?:api[_-]?key|key|token|access_token|secret|password)=[A-Za-z0-9._~-]{8,}/i },
  { nome: 'api_key literal', re: /api[_-]?key["']?\s*[:=]\s*["'][A-Za-z0-9._-]{16,}["']/i },
];

/** Procura segredos em um texto. Devolve [{nome, linha}] sem nunca devolver o valor encontrado. */
export function acharSegredos(texto) {
  const achados = [];
  texto.split('\n').forEach((linha, i) => {
    for (const { nome, re } of SEGREDOS) if (re.test(linha)) achados.push({ nome, linha: i + 1 });
  });
  return achados;
}

/** Endereço seguro para mostrar ou gravar: protocolo, host e caminho. Nunca usuário, senha, query nem fragmento. */
export function enderecoSeguro(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return null;
  }
}

/** Remove de um texto qualquer coisa que pareça credencial antes de ele ir para a tela ou para um arquivo. */
export function limparSaida(texto, { chave = '' } = {}) {
  let t = String(texto);
  t = t.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s]*@/gi, '$1***@'); // usuário:senha@ (inclusive com @ na senha)
  t = t.replace(/\?[^\s"'<>]*/g, '?***'); // query strings
  if (chave.length >= 4) t = t.split(chave).join('***');
  t = t.replace(/(?<![A-Za-z0-9])(?:sk|pk|rk|hf|gh[pousr]|xox[abprs])[-_][A-Za-z0-9*._-]{6,}/g, '***');
  t = t.replace(/Bearer\s+\S+/gi, 'Bearer ***');
  t = t.replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g, '***'); // sequências longas parecem tokens
  return t;
}
