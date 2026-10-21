// Taxa de erro de palavras (WER, "word error rate"): quanto da frase de referência o ditado ou a transcrição errou.
// Sem dependências (Node 22+). Serve ao hack PH-VOZ-02 (teste cego de 10 frases): cada aluno mede as ferramentas com
// os PRÓPRIOS áudios em vez de confiar em "95% de acerto" de propaganda.
//
//   WER = (substituições + remoções + inserções) / palavras da referência
//
// Pontos que mudam o número (e que o aluno deve decidir antes de comparar ferramentas, igual para todas):
//   - pontuação e maiúsculas NÃO contam (a normalização as descarta); acentos CONTAM por padrão (`semAcentos: true` os ignora);
//   - número escrito de formas diferentes ("10" e "dez") conta como erro: normalize os dois lados do mesmo jeito antes;
//   - o WER pode passar de 1 (100%) quando a ferramenta INVENTA texto (inserções), por exemplo ao transcrever silêncio.
import { ehPrincipal } from '../../../ferramentas/comum.mjs';

/** Palavras de um texto: letras e dígitos, com hífen ou apóstrofo no meio ("guarda-chuva", "d'água"). */
export function palavras(texto, { semAcentos = false } = {}) {
  let t = String(texto).normalize('NFC').toLocaleLowerCase('pt-BR');
  if (semAcentos) t = t.normalize('NFD').replace(/\p{M}/gu, '');
  return t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}

/**
 * Distância de edição entre as duas listas de palavras, com a contagem de cada tipo de erro.
 * (Se houver mais de um alinhamento ótimo, o total de erros é o mesmo; a divisão entre os tipos pode variar.)
 */
function alinhar(ref, hip) {
  const n = ref.length;
  const m = hip.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const troca = d[i - 1][j - 1] + (ref[i - 1] === hip[j - 1] ? 0 : 1);
      d[i][j] = Math.min(troca, d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  let i = n;
  let j = m;
  let substituicoes = 0;
  let remocoes = 0;
  let insercoes = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hip[j - 1] ? 0 : 1)) {
      if (ref[i - 1] !== hip[j - 1]) substituicoes += 1;
      i -= 1; j -= 1;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { remocoes += 1; i -= 1; } else { insercoes += 1; j -= 1; }
  }
  return { substituicoes, remocoes, insercoes };
}

/**
 * WER de UMA frase.
 * @returns {{wer: number, palavrasReferencia: number, erros: number, substituicoes: number, remocoes: number, insercoes: number}}
 */
export function wer(referencia, hipotese, opcoes = {}) {
  const ref = palavras(referencia, opcoes);
  const hip = palavras(hipotese, opcoes);
  if (ref.length === 0) throw new RangeError('a referência não tem palavras: não existe WER sem texto de referência');
  const { substituicoes, remocoes, insercoes } = alinhar(ref, hip);
  const erros = substituicoes + remocoes + insercoes;
  return { wer: erros / ref.length, palavrasReferencia: ref.length, erros, substituicoes, remocoes, insercoes };
}

/**
 * WER de um CONJUNTO de frases: soma dos erros dividida pela soma das palavras de referência. Não é a média dos WER por frase
 * (que daria o mesmo peso a uma frase de 3 palavras e a uma de 30).
 * @param {Array<{referencia: string, hipotese: string}>} pares
 */
export function werDoConjunto(pares, opcoes = {}) {
  if (!Array.isArray(pares) || pares.length === 0) throw new RangeError('passe ao menos um par {referencia, hipotese}');
  const frases = pares.map((p) => wer(p.referencia, p.hipotese, opcoes));
  const erros = frases.reduce((s, f) => s + f.erros, 0);
  const total = frases.reduce((s, f) => s + f.palavrasReferencia, 0);
  return { wer: erros / total, palavrasReferencia: total, erros, frases };
}

// Uso rápido: node wer.mjs "frase de referência" "o que a ferramenta escreveu"
if (ehPrincipal(import.meta.url)) {
  const [ref, hip] = process.argv.slice(2);
  if (ref === undefined || hip === undefined) {
    console.error('uso: node wer.mjs "frase de referência" "texto da ferramenta"');
    process.exitCode = 2;
  } else {
    try {
      const r = wer(ref, hip);
      console.log(`WER ${(r.wer * 100).toFixed(1)}% (${r.erros} erros em ${r.palavrasReferencia} palavras: ${r.substituicoes} trocas, ${r.remocoes} faltas, ${r.insercoes} sobras)`);
    } catch (e) {
      console.error(`erro: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
