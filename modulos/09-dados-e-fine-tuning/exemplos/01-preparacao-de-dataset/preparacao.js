// Funções puras da preparação do dataset (testadas em preparacao.test.js).
// Cada etapa é pequena e explícita para você conseguir medir o efeito de cada uma no relatório.
import { CATEGORIAS, SYSTEM_PROMPT } from '../../comum/config.js';

// ---------- 1. Limpeza e padronização de texto ----------
const ENTIDADES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function limparTexto(bruto) {
  let t = String(bruto ?? '');
  t = t.replace(/&[a-z#0-9]+;/gi, (e) => ENTIDADES[e.toLowerCase()] ?? ' '); // entidades HTML
  t = t.replace(/<[^>]+>/g, ' '); // tags HTML de e-mail
  // Dados pessoais NÃO entram no dataset: além de LGPD, o modelo pode memorizar e "vazar" depois.
  t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<EMAIL>');
  t = t.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '<CPF>');
  t = t.replace(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g, '<TELEFONE>');
  t = t.normalize('NFC').replace(/\s+/g, ' ').trim();
  // Texto todo em CAIXA ALTA vira caixa normal (o modelo não deve associar "gritar" a uma categoria).
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras.length > 10 && letras === letras.toUpperCase()) {
    t = t.toLowerCase().replace(/<(email|cpf|telefone)>/g, (m) => m.toUpperCase());
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t;
}

// ---------- 2. Padronização do rótulo ----------
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const SINONIMOS = { financeiro: 'cobranca', login: 'acesso', logistica: 'entrega', 'produto com defeito': 'defeito', troca: 'defeito', cancelar: 'cancelamento' };

/** Devolve a categoria canônica ou null (rótulo vazio/fora do domínio = descartar). */
export function padronizarRotulo(bruto) {
  const r = semAcento(String(bruto ?? '')).toLowerCase().trim();
  const canon = SINONIMOS[r] ?? r;
  return CATEGORIAS.includes(canon) ? canon : null;
}

// ---------- 3. Deduplicação (exata e quase-duplicata) ----------
export const chaveNormalizada = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9<> ]/g, '').replace(/\s+/g, ' ').trim();

function jaccard(a, b) {
  const A = new Set(a.split(' ')), B = new Set(b.split(' '));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Remove duplicatas exatas (após normalizar) e quase-duplicatas (Jaccard de palavras >= limiar). */
export function deduplicar(registros, limiar = 0.9) {
  const vistos = new Map(), mantidos = [];
  let exatas = 0, quase = 0, conflitos = 0;
  for (const r of registros) {
    const k = chaveNormalizada(r.texto);
    if (vistos.has(k)) {
      exatas++;
      if (vistos.get(k).categoria !== r.categoria) conflitos++; // mesmo texto, rótulos diferentes = ruído de rótulo
      continue;
    }
    // O(n²) é aceitável para centenas de linhas; com milhões use MinHash/LSH.
    const parecido = mantidos.find((m) => jaccard(chaveNormalizada(m.texto), k) >= limiar);
    if (parecido) { quase++; if (parecido.categoria !== r.categoria) conflitos++; continue; }
    vistos.set(k, r);
    mantidos.push(r);
  }
  return { mantidos, exatas, quase, conflitos };
}

// ---------- 4. Balanceamento e split ----------
export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function embaralhar(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const contarPorCategoria = (regs) => Object.fromEntries(CATEGORIAS.map((c) => [c, regs.filter((r) => r.categoria === c).length]));

/** Undersampling: cada classe fica com no máximo `fator` × o tamanho da menor classe. */
export function balancear(registros, rand, fator = 1.5) {
  const cont = contarPorCategoria(registros);
  const teto = Math.ceil(Math.min(...Object.values(cont)) * fator);
  return CATEGORIAS.flatMap((c) => embaralhar(registros.filter((r) => r.categoria === c), rand).slice(0, teto));
}

/** Split estratificado: mantém a proporção de cada categoria no treino e na validação. */
export function splitEstratificado(registros, rand, fracValidacao = 0.2) {
  const treino = [], validacao = [];
  for (const c of CATEGORIAS) {
    const grupo = embaralhar(registros.filter((r) => r.categoria === c), rand);
    const nVal = Math.max(1, Math.round(grupo.length * fracValidacao));
    validacao.push(...grupo.slice(0, nVal));
    treino.push(...grupo.slice(nVal));
  }
  return { treino: embaralhar(treino, rand), validacao: embaralhar(validacao, rand) };
}

// ---------- 5. Formato chat das APIs de fine-tuning (uma conversa por linha) ----------
export const paraChatJsonl = (r) => ({
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: r.texto },
    { role: 'assistant', content: r.categoria },
  ],
});

// ---------- 6. Métricas de qualidade e diversidade ----------
export function diversidade(textos) {
  const palavras = textos.flatMap((t) => chaveNormalizada(t).split(' ').filter(Boolean));
  const bigramas = palavras.slice(1).map((p, i) => palavras[i] + ' ' + p);
  return {
    // type-token ratio: vocabulário distinto / total (baixo = textos repetitivos)
    ttr: +(new Set(palavras).size / palavras.length).toFixed(3),
    distinct2: +(new Set(bigramas).size / bigramas.length).toFixed(3),
    mediaPalavras: +(palavras.length / textos.length).toFixed(1),
  };
}
