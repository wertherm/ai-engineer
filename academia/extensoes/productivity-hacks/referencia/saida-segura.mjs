// Limpeza de texto na ENTRADA e na SAÍDA de um modelo, sem dependências (Node 22+). Serve ao hack PH-EMA-07 e ao projeto PP-09.
//
// Por que existe: e-mail, convite de calendário, página e PDF são entrada NÃO confiável. Casos documentados mostram dois truques
// que esta função combate (veja trilhas/email-e-agenda.md):
//   1. texto escondido (caracteres invisíveis, HTML com fonte de tamanho zero) que o modelo lê e a pessoa não vê;
//   2. saída com imagem ou link para um endereço do atacante, com dados da conversa na própria URL: ao exibir a resposta,
//      o cliente busca a imagem e os dados saem sem ninguém clicar.
//
// O que NÃO é: não é prova de segurança. É uma camada barata e determinística que reduz o canal de vazamento. Limites conhecidos:
//   - o texto escondido por CSS só é detectado nos casos simples abaixo (estilo inline ou atributo hidden); classes e folhas de
//     estilo externas escapam: quando houver a parte text/plain do e-mail, use-a em vez do HTML;
//   - texto entre < e > que pareça uma tag HTML é removido (pode apagar "x<y e z>w" de uma expressão matemática);
//   - "h t t p" com espaços e outras ofuscações não são URLs para esta função: o coberto é imagem/link markdown, HTML e URL completa;
//   - ZWJ e ZWNJ também são removidos (podem esconder dados), o que separa emojis compostos;
//   - o texto é cortado em MAX_CARACTERES (a varredura precisa de teto contra entrada hostil); o resultado traz `truncado`.
// Sempre some a isso: nenhuma ferramenta de ação para o modelo que lê conteúdo externo, lista de permissão e aprovação humana.

export const MAX_CARACTERES = 100_000;

// Faixas por codigo numerico (o codigo-fonte nao contem os caracteres invisiveis): controles C0 (menos \t e \n), DEL e C1, hifen suave,
// largura zero e marcas bidi (200B-200F, 2028-202E, 2060-2064, 2066-206F), BOM, anotacoes interlineares, caracteres de tag e seletores de variacao.
const FAIXAS_INVISIVEIS = [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb], [0xe0000, 0xe007f], [0xe0100, 0xe01ef]];
const INVISIVEIS = new RegExp(`[${FAIXAS_INVISIVEIS.map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join('')}]`, 'gu');

// Estilos inline que escondem um elemento da pessoa (heurística: ver os limites acima).
const ESTILO_OCULTO = /(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:\.0+)?(?:px|pt|em|rem|%)?\s*(?:;|$|")|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$|")|max-height\s*:\s*0|line-height\s*:\s*0\s*(?:px)?\s*(?:;|$|"))/i;
const TAG_VAZIA = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const PROTOCOLOS_URL = '(?:https?|ftp|ftps|file|data|javascript|vbscript|mailto|tel|sms|intent|blob)';
// corpo do endereço: qualquer coisa sem espaço, aspas, <, > nem parêntese solto; parênteses só aparecem em pares (`alert(1)`, `/wiki/X_(Y)`),
// assim "(veja https://x.com/a)" não leva o parêntese final junto. As duas alternativas começam por caracteres diferentes: sem retrocesso.
const CORPO_URL = `(?:[^\\s<>"'()\\]]|\\([^\\s()<>"']{0,300}\\)){1,2000}`;
const URL_SOLTA = new RegExp(`\\b${PROTOCOLOS_URL}\\s{0,3}:(?:\\/\\/)?${CORPO_URL}|\\bwww\\.${CORPO_URL}`, 'giu');

function novoRelatorio() {
  return { invisiveis: 0, ocultos: 0, html: 0, imagens: 0, links: 0, urls: 0 };
}
const somou = (r) => Object.values(r).some((n) => n > 0);

/** Remove caracteres invisíveis e de controle (menos \n e \t). */
export function removerInvisiveis(texto) {
  return String(texto).replace(/\r\n?/g, '\n').replace(INVISIVEIS, '');
}

/**
 * Remove blocos do tipo abre...fecha numa só passada (tempo linear). Sem o fechamento, descarta o resto do texto: é assim que um
 * navegador trataria um comentário ou um script que nunca fecha, e é o lado seguro para texto que vai ser lido por um modelo.
 */
function removerBlocos(t, reAbre, fechaDe, r, campo) {
  let saida = '';
  let pos = 0;
  for (;;) {
    reAbre.lastIndex = pos;
    const a = reAbre.exec(t);
    if (!a) break;
    saida += t.slice(pos, a.index);
    r[campo] += 1;
    const fecha = fechaDe(a);
    fecha.lastIndex = a.index + a[0].length;
    const f = fecha.exec(t);
    if (!f) return saida;
    pos = f.index + f[0].length;
  }
  return saida + t.slice(pos);
}

function tiraHtml(t, r) {
  t = removerBlocos(t, /<!--/g, () => /-->/g, r, 'html');
  t = removerBlocos(t, /<(script|style|template|noscript)\b[^>]{0,500}>/gi, (a) => new RegExp(`</${a[1]}\\s*>`, 'gi'), r, 'html');
  // elementos escondidos por estilo inline ou pelo atributo hidden: remove o elemento e o que ele contém (sem tratar a mesma tag aninhada)
  let saida = '';
  let pos = 0;
  const abre = /<([A-Za-z][A-Za-z0-9-]{0,30})\b([^<>]{0,1000})>/g;
  for (;;) {
    abre.lastIndex = pos;
    const a = abre.exec(t);
    if (!a) break;
    const estilo = /\bstyle\s*=\s*("[^"]*"|'[^']*')/i.exec(a[2])?.[1] ?? '';
    const semEstilo = a[2].replace(/\bstyle\s*=\s*("[^"]*"|'[^']*')/i, '');
    const escondido = ESTILO_OCULTO.test(estilo) || /\bhidden\b(?!\s*=\s*["']?false)/i.test(semEstilo);
    if (!escondido) { abre.lastIndex = a.index + a[0].length; saida += t.slice(pos, a.index + a[0].length); pos = a.index + a[0].length; continue; }
    saida += t.slice(pos, a.index);
    r.ocultos += 1;
    if (TAG_VAZIA.has(a[1].toLowerCase()) || /\/\s*$/.test(a[2])) { pos = a.index + a[0].length; continue; }
    const fecha = new RegExp(`</${a[1]}\\s*>`, 'gi');
    fecha.lastIndex = a.index + a[0].length;
    const f = fecha.exec(t);
    if (!f) return saida; // nunca fecha: descarta o resto
    pos = f.index + f[0].length;
  }
  t = saida + t.slice(pos);
  return t.replace(/<\/?[A-Za-z][A-Za-z0-9-]{0,30}(?:\s[^<>]{0,1000})?\/?>/g, () => { r.html += 1; return ''; });
}

function prepara(texto, removidos) {
  let t = String(texto).replace(/\r\n?/g, '\n');
  const truncado = t.length > MAX_CARACTERES;
  if (truncado) t = t.slice(0, MAX_CARACTERES);
  t = t.replace(INVISIVEIS, () => { removidos.invisiveis += 1; return ''; });
  return { t, truncado };
}

/**
 * Prepara texto NÃO confiável (e-mail, página, convite) antes de entregá-lo a um modelo: tira invisíveis, elementos escondidos
 * (heurística), comentários, script/style e as tags. Mantém as URLs (quem lê o conteúdo pode precisar delas).
 * @returns {{texto: string, removidos: object, suspeito: boolean, truncado: boolean}}
 */
export function limparEntrada(texto) {
  const removidos = novoRelatorio();
  const { t, truncado } = prepara(texto, removidos);
  const limpo = tiraHtml(t, removidos);
  return { texto: limpo, removidos, suspeito: somou(removidos), truncado };
}

/** Domínios permitidos viram uma lista de nomes em minúsculas, sem ponto inicial. */
function normalizarDominios(lista) {
  if (!Array.isArray(lista)) throw new TypeError('dominiosPermitidos deve ser uma lista de nomes de domínio');
  return lista.map((d) => {
    const s = String(d).trim().toLowerCase().replace(/^\.+/, '');
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(s)) throw new RangeError(`domínio inválido na lista de permissão: ${JSON.stringify(String(d).slice(0, 60))}`);
    return s;
  });
}

/** Só http e https, e só o nome do host (o que está antes de `@` NÃO conta; `exemplo.com.atacante.net` não é `exemplo.com`). */
function hostPermitido(url, dominios) {
  if (dominios.length === 0) return false;
  let u;
  try { u = new URL(url.replace(/[.,;:!?]+$/, '').replace(/^\/\//, 'https://')); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  return dominios.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Limpa a SAÍDA do modelo antes de mostrá-la (Telegram, tela, e-mail): sem imagens, sem HTML, sem caracteres invisíveis e sem
 * links, exceto os de domínios que você liberou. Devolve também o que foi removido, para você registrar e alertar.
 * @param {string} texto
 * @param {{dominiosPermitidos?: string[]}} [opcoes]
 * @returns {{texto: string, removidos: object, suspeito: boolean, truncado: boolean}}
 */
export function limparSaidaDoModelo(texto, { dominiosPermitidos = [] } = {}) {
  const dominios = normalizarDominios(dominiosPermitidos);
  const removidos = novoRelatorio();
  const pre = prepara(texto, removidos);
  let t = tiraHtml(pre.t, removidos);
  // imagens markdown: ![alt](url "titulo") e ![alt][ref]
  t = t.replace(/!\[[^\]]{0,500}\]\(\s*<?[^)\s>]{1,2000}>?(?:\s+(?:"[^"]{0,500}"|'[^']{0,500}'))?\s*\)/g, () => { removidos.imagens += 1; return '[imagem removida]'; });
  t = t.replace(/!\[[^\]]{0,500}\]\[[^\]]{0,200}\]/g, () => { removidos.imagens += 1; return '[imagem removida]'; });
  // definições de referência: [ref]: url
  t = t.replace(/^[ \t]{0,3}\[[^\]\n]{1,200}\]:[ \t]*\S[^\n]{0,2000}$/gm, () => { removidos.links += 1; return ''; });
  // links markdown: [texto](url "titulo") e [texto][ref]
  t = t.replace(/\[([^\]]{0,500})\]\(\s*<?([^)\s>]{1,2000})>?(?:\s+(?:"[^"]{0,500}"|'[^']{0,500}'))?\s*\)/g, (_m, rotulo, url) => {
    if (hostPermitido(url, dominios)) return `${rotulo} (${url})`;
    removidos.links += 1;
    return `${rotulo} [link removido]`;
  });
  t = t.replace(/\[([^\]]{0,500})\]\[[^\]]{0,200}\]/g, (_m, rotulo) => { removidos.links += 1; return `${rotulo} [link removido]`; });
  // endereços soltos
  t = t.replace(URL_SOLTA, (url) => {
    if (hostPermitido(url, dominios)) return url;
    removidos.urls += 1;
    return '[link removido]';
  });
  return { texto: t, removidos, suspeito: somou(removidos), truncado: pre.truncado };
}
