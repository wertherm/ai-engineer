// Pipeline de preparação: tickets brutos -> limpeza -> rótulos padronizados -> dedup -> balanceamento
// -> split estratificado -> JSONL no formato chat das APIs de fine-tuning + relatório de qualidade.
// Uso: node exemplos/01-preparacao-de-dataset/preparar.js [--sem-balancear]
import fs from 'node:fs';
import path from 'node:path';
import { DADOS } from '../../comum/config.js';
import {
  limparTexto, padronizarRotulo, deduplicar, balancear, splitEstratificado,
  paraChatJsonl, contarPorCategoria, diversidade, mulberry32,
} from './preparacao.js';

const SEMENTE = 42;
const MIN_CARACTERES = 15;
const MAX_CARACTERES = 1000;
const balancearAtivo = !process.argv.includes('--sem-balancear');

const linhas = fs.readFileSync(path.join(DADOS, 'tickets-brutos.jsonl'), 'utf8').split('\n').filter(Boolean);
const relatorio = { entrada: linhas.length, descartes: {} };
const descartar = (motivo) => { relatorio.descartes[motivo] = (relatorio.descartes[motivo] ?? 0) + 1; };

// 1+2. Limpeza do texto e padronização do rótulo, linha a linha (uma linha ruim não derruba o lote).
const limpos = [];
for (const linha of linhas) {
  let r;
  try { r = JSON.parse(linha); } catch { descartar('json_invalido'); continue; }
  const categoria = padronizarRotulo(r.categoria);
  if (!categoria) { descartar('rotulo_fora_do_dominio'); continue; }
  let texto = limparTexto(r.texto);
  if (texto.length < MIN_CARACTERES) { descartar('texto_curto_ou_vazio'); continue; }
  if (texto.length > MAX_CARACTERES) texto = texto.slice(0, MAX_CARACTERES);
  limpos.push({ id: r.id, texto, categoria });
}
relatorio.aposLimpeza = limpos.length;
relatorio.distribuicaoAntes = contarPorCategoria(limpos);

// 3. Deduplicação.
const { mantidos, exatas, quase, conflitos } = deduplicar(limpos);
Object.assign(relatorio, { duplicatasExatas: exatas, quaseDuplicatas: quase, conflitosDeRotulo: conflitos, aposDedup: mantidos.length });

// 4. Balanceamento (undersampling) e split estratificado, ambos com semente.
const rand = mulberry32(SEMENTE);
const base = balancearAtivo ? balancear(mantidos, rand) : mantidos;
relatorio.distribuicaoDepois = contarPorCategoria(base);
const { treino, validacao } = splitEstratificado(base, rand);

// Vazamento: nenhum texto de validação pode existir no treino (senão a métrica mente).
const textosTreino = new Set(treino.map((r) => r.texto));
relatorio.vazamentoTreinoValidacao = validacao.filter((r) => textosTreino.has(r.texto)).length;
relatorio.treino = treino.length;
relatorio.validacao = validacao.length;
relatorio.diversidadeTreino = diversidade(treino.map((r) => r.texto));

// 5. Grava os JSONL (uma conversa por linha) e o relatório.
const gravar = (nome, regs) => fs.writeFileSync(path.join(DADOS, nome), regs.map((r) => JSON.stringify(paraChatJsonl(r))).join('\n') + '\n');
gravar('treino.jsonl', treino);
gravar('validacao.jsonl', validacao);
fs.writeFileSync(path.join(DADOS, 'relatorio-qualidade.json'), JSON.stringify(relatorio, null, 2) + '\n');

console.log('Relatório de qualidade do dataset');
console.log(JSON.stringify(relatorio, null, 2));
console.log('\nPrimeira linha de dados/treino.jsonl:');
console.log(JSON.stringify(paraChatJsonl(treino[0])));
