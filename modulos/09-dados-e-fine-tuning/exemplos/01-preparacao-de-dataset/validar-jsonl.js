// Validador de JSONL para fine-tuning no formato chat (o mesmo que a OpenAI exige em /v1/fine_tuning/jobs).
// Rode ANTES de subir o arquivo: um erro de formato só aparece no job depois do upload (status "failed").
// Uso: node validar-jsonl.js <treino.jsonl> [validacao.jsonl]  -> sai com código 1 se houver erro.
import fs from 'node:fs';
import { CATEGORIAS } from '../../comum/config.js';
import { tokensDaConversa } from '../../comum/tokens.js';

const PAPEIS = new Set(['system', 'user', 'assistant', 'tool']);
const MIN_EXEMPLOS = 10; // mínimo aceito pela OpenAI (a doc recomenda começar com ~50)
const MAX_TOKENS_EXEMPLO = 4096; // limite NOSSO, conservador: exemplos longos demais encarecem e são truncados

export function validarArquivo(caminho) {
  const erros = [], avisos = [];
  const linhas = fs.readFileSync(caminho, 'utf8').split('\n').filter((l) => l.trim());
  const rotulos = {};
  let tokens = 0;
  linhas.forEach((linha, i) => {
    const n = i + 1;
    let ex;
    try { ex = JSON.parse(linha); } catch { erros.push(`linha ${n}: JSON inválido`); return; }
    if (!Array.isArray(ex.messages) || ex.messages.length < 2) { erros.push(`linha ${n}: "messages" ausente ou curto`); return; }
    const extras = Object.keys(ex).filter((k) => !['messages', 'tools', 'parallel_tool_calls'].includes(k));
    if (extras.length) erros.push(`linha ${n}: chaves não reconhecidas ${extras.join(',')}`);
    for (const m of ex.messages) {
      if (!PAPEIS.has(m.role)) erros.push(`linha ${n}: papel inválido "${m.role}"`);
      if (typeof m.content !== 'string' || !m.content.trim()) erros.push(`linha ${n}: mensagem ${m.role} sem conteúdo`);
    }
    const ultima = ex.messages.at(-1);
    if (ultima.role !== 'assistant') erros.push(`linha ${n}: a última mensagem precisa ser do assistant (é o alvo do treino)`);
    // Checagem de DOMÍNIO (além do formato): o alvo tem que ser uma categoria válida.
    if (!CATEGORIAS.includes(ultima.content)) erros.push(`linha ${n}: rótulo fora do domínio "${ultima.content}"`);
    rotulos[ultima.content] = (rotulos[ultima.content] ?? 0) + 1;
    const t = tokensDaConversa(ex.messages);
    if (t > MAX_TOKENS_EXEMPLO) avisos.push(`linha ${n}: ${t} tokens (> ${MAX_TOKENS_EXEMPLO})`);
    tokens += t;
  });
  if (linhas.length < MIN_EXEMPLOS) erros.push(`apenas ${linhas.length} exemplos (mínimo ${MIN_EXEMPLOS})`);
  const contagens = Object.values(rotulos);
  if (contagens.length && Math.max(...contagens) > 3 * Math.min(...contagens)) avisos.push('classes muito desbalanceadas (> 3:1)');
  return { caminho, exemplos: linhas.length, tokens, rotulos, erros, avisos, textos: linhas.map((l) => { try { return JSON.parse(l).messages.find((m) => m.role === 'user')?.content; } catch { return null; } }) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arquivos = process.argv.slice(2);
  if (!arquivos.length) { console.error('uso: node validar-jsonl.js <treino.jsonl> [validacao.jsonl]'); process.exit(2); }
  const res = arquivos.map(validarArquivo);
  let falhou = false;
  for (const r of res) {
    console.log(`${r.caminho}: ${r.exemplos} exemplos, ~${r.tokens} tokens, rótulos ${JSON.stringify(r.rotulos)}`);
    r.erros.slice(0, 10).forEach((e) => console.log('  ERRO  ', e));
    r.avisos.slice(0, 10).forEach((a) => console.log('  aviso ', a));
    if (r.erros.length) falhou = true;
  }
  // Vazamento entre treino e validação: o mesmo exemplo nos dois infla a métrica de validação.
  if (res.length === 2) {
    const treino = new Set(res[0].textos);
    const vazados = res[1].textos.filter((t) => treino.has(t)).length;
    console.log(`vazamento treino→validação: ${vazados} exemplo(s)`);
    if (vazados) falhou = true;
  }
  console.log(falhou ? 'RESULTADO: reprovado' : 'RESULTADO: aprovado');
  process.exit(falhou ? 1 : 0);
}
