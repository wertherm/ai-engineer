// Copiado do módulo 10 (exemplos/04-pii-e-mascaramento/pii.js): o capstone reaproveita a peça pronta.
// Detecção e mascaramento de PII brasileira ANTES de mandar texto ao LLM e antes de gravar logs.
// Regex sozinha gera falso positivo (todo número de 11 dígitos "parece" CPF); por isso CPF passa pelo
// dígito verificador e cartão pelo algoritmo de Luhn.

const soDigitos = (s) => s.replace(/\D/g, '');

/** CPF válido: 11 dígitos, não todos iguais, e os 2 dígitos verificadores batem (módulo 11). */
export function cpfValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Luhn: dobra dígitos alternados da direita para a esquerda; soma múltipla de 10 = número plausível. */
export function luhnValido(valor) {
  const d = soDigitos(valor);
  if (d.length < 13 || d.length > 19) return false;
  let soma = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
  }
  return soma % 10 === 0;
}

// Ordem importa: cartão e CPF antes de telefone, porque todos são "números com separadores".
// (?<!\d) e (?!\d) evitam casar um pedaço de um número maior.
const DETECTORES = [
  { tipo: 'EMAIL', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { tipo: 'CARTAO', re: /(?<!\d)\d{4}(?:[ -]?\d{4}){2}[ -]?\d{1,7}(?!\d)/g, valida: luhnValido },
  { tipo: 'CPF', re: /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g, valida: cpfValido },
  // +55 opcional, DDD com ou sem parênteses, 8 ou 9 dígitos (celular começa com 9)
  { tipo: 'TELEFONE', re: /(?<![\d+])(?:\+?55[ -]?)?\(?\d{2}\)?[ -]?9?\d{4}[ -]?\d{4}(?!\d)/g },
];

/**
 * Troca cada PII por um marcador ([CPF_1], [EMAIL_1]...) e devolve o "cofre" para desfazer.
 * Isso é PSEUDONIMIZAÇÃO (LGPD art. 13 §4º): reversível por quem guarda o cofre. Não é anonimização.
 */
export function mascarar(texto) {
  const cofre = new Map(); // marcador -> valor original
  const porValor = new Map(); // valor original -> marcador (o mesmo CPF vira sempre o mesmo marcador)
  const contagem = {};
  let saida = texto;
  for (const { tipo, re, valida } of DETECTORES) {
    saida = saida.replace(re, (achado) => {
      if (/\[[A-Z]+_\d+\]/.test(achado)) return achado;
      if (valida && !valida(achado)) return achado; // parece, mas não é: não mascara
      if (porValor.has(achado)) return porValor.get(achado);
      contagem[tipo] = (contagem[tipo] ?? 0) + 1;
      const marcador = `[${tipo}_${contagem[tipo]}]`;
      cofre.set(marcador, achado);
      porValor.set(achado, marcador);
      return marcador;
    });
  }
  return { texto: saida, cofre, contagem };
}

/**
 * Recoloca os valores originais na resposta (só no backend, nunca no log).
 * `parciais`: tipos que nunca voltam inteiros para a tela (mostra só os 4 últimos dígitos).
 */
export function desmascarar(texto, cofre, { parciais = [] } = {}) {
  return texto.replace(/\[([A-Z]+)_\d+\]/g, (m, tipo) => {
    const original = cofre.get(m);
    if (original === undefined) return m;
    return parciais.includes(tipo) ? `****${soDigitos(original).slice(-4)}` : original;
  });
}

/** Logger que nunca grava PII: mascara antes de escrever (e descarta o cofre). */
export function logSeguro(evento, dados) {
  const linha = JSON.stringify({ ts: new Date().toISOString(), evento, ...dados });
  console.log(mascarar(linha).texto);
}
