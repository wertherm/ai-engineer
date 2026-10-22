// Limpeza de texto na ENTRADA e na SAÍDA de um modelo, sem dependências (Node 22+). Serve ao hack PH-EMA-07 e ao projeto PP-09.
//
// Por que existe: e-mail, convite de calendário, página e PDF são entrada NÃO confiável. Casos documentados mostram dois truques
// que estas funções combatem (veja trilhas/email-e-agenda.md):
//   1. texto escondido (caracteres invisíveis, HTML com fonte de tamanho zero) que o modelo lê e a pessoa não vê;
//   2. saída com imagem ou link para um endereço do atacante, com dados da conversa na própria URL: ao exibir a resposta,
//      o cliente busca a imagem e os dados saem sem ninguém clicar.
//
// O que NÃO é: não é prova de segurança. É uma camada barata e determinística que reduz o canal de vazamento. Limites conhecidos:
//   - texto escondido só é detectado pelo que está no próprio elemento: estilo inline (display:none, visibility, opacity 0, fonte 0,
//     altura ou largura 0 com overflow cortado, posição fora da tela, recuo negativo, transform scale(0), clip, cor transparente)
//     e o atributo `hidden`. Classes CSS e folhas de estilo externas escapam: quando houver a parte text/plain do e-mail, use-a em vez do
//     HTML. Cor clara (branco) NÃO é removida (texto branco em fundo escuro é legítimo): é contada em `sinais.corClara` e deixa
//     `suspeito` verdadeiro, para você decidir (por exemplo, pedir revisão humana);
//   - na SAÍDA, qualquer coisa que pareça uma tag HTML (`<` seguido de letra, `/`, `!` ou `?`) é removida, o que apaga `List<String>`;
//     na ENTRADA, só tags bem formadas são removidas (e `<String>` também é lida como tag);
//   - na saída, domínio solto SEM barra nem esquema (`atacante.com`) não é tratado: nome de arquivo e de biblioteca também parecem
//     domínio. O endereço com `/`, `?` ou `#` depois do domínio, `//host`, `www.` e qualquer `esquema:` são tratados. Desligue a
//     pré-visualização de links no cliente (`link_preview_options`);
//   - ZWJ e ZWNJ também são removidos (podem esconder dados), o que separa emojis compostos; seletores de variação FE00 a FE0E também;
//     FE0F (apresentação de emoji) fica;
//   - o texto é cortado em MAX_CARACTERES (a varredura precisa de teto contra entrada hostil); o resultado traz `truncado`.
// Sempre some a isso: nenhuma ferramenta de ação para o modelo que lê conteúdo externo, lista de permissão e aprovação humana.

export const MAX_CARACTERES = 100_000;
const LIMITE_TAG = 4000; // tamanho máximo de uma tag lida (teto contra entrada hostil)
const LIMITE_ROTULO = 2000;
const LIMITE_DESTINO = 6000;
// Orçamento de passos da varredura de markdown: texto hostil com milhares de `![x](` abertos faria cada um varrer milhares de caracteres
// (tempo quadrático). Estourou o orçamento: o RESTO do texto é descartado (falha para o lado seguro) e o resultado fica `suspeito`.
const ORCAMENTO_DE_PASSOS = 2_000_000;
const ESTOUROU = Symbol('estourou o orçamento de passos');

// Faixas por código numérico (o código-fonte não contém os caracteres invisíveis): controles C0 (menos \t e \n), DEL e C1, hífen suave,
// largura zero e marcas bidi (200B-200F, 2028-202E, 2060-2064, 2066-206F), BOM, anotações interlineares, caracteres de tag, seletores de
// variação, preenchedores Hangul, braille em branco e outros "espaços" sem largura.
const FAIXAS_INVISIVEIS = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c], [0x115f, 0x1160], [0x17b4, 0x17b5],
  [0x180e, 0x180e], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f], [0x2800, 0x2800], [0x3164, 0x3164],
  [0xfe00, 0xfe0e], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff9, 0xfffc], [0xe0000, 0xe007f], [0xe0100, 0xe01ef],
];
const INVISIVEIS = new RegExp(`[${FAIXAS_INVISIVEIS.map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join('')}]`, 'gu');

// letras, dígitos e pontuação de LARGURA TOTAL (FF01 a FF5E) viram ASCII na saída: um cliente pode ler 'ｈｔｔｐｓ' como https
const LARGURA_TOTAL = new RegExp(`[${String.fromCharCode(0xff01)}-${String.fromCharCode(0xff5e)}]`, 'g');
const TAG_VAZIA = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// blocos que o navegador não mostra: somem com o conteúdo (contados em `removidos.scripts`)
const BLOCOS_INERTES = new Set(['script', 'style', 'template', 'noscript', 'head', 'title']);

const PROTOCOLOS_URL = '(?:https?|ftp|ftps|file|data|javascript|vbscript|mailto|tel|sms|intent|blob)';
// corpo do endereço: qualquer coisa sem espaço, aspas, <, > nem parêntese solto; parênteses só aparecem em pares (`alert(1)`, `/wiki/X_(Y)`),
// assim "(veja https://x.com/a)" não leva o parêntese final junto. As duas alternativas começam por caracteres diferentes: sem retrocesso.
const CORPO_URL = `(?:[^\\s<>"'()\\]]|\\([^\\s()<>"']{0,300}\\)){1,2000}`;
const HOST = '(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,24}(?::\\d{1,5})?';
const URL_SOLTA = new RegExp([
  `(?<![A-Za-z0-9])(?:${PROTOCOLOS_URL}\\s{0,3}:(?:\\/\\/)?|[A-Za-z][A-Za-z0-9+.-]{1,20}:\\/\\/)${CORPO_URL}`, // esquema:... e qualquer esquema://...
  `(?<![A-Za-z0-9:/])\\/\\/${HOST}(?:[/?#]${CORPO_URL})?`, // //host/caminho
  `(?<![A-Za-z0-9])www\\.${CORPO_URL}`, // www.host
  `(?<![A-Za-z0-9@./_-])${HOST}[/?#]${CORPO_URL}`, // host.tld/caminho (com barra, ? ou # logo depois do domínio)
].join('|'), 'giu');

// Domínios que são sufixo público ou hospedagem compartilhada: liberar um deles liberaria qualquer pessoa que registre um nome embaixo.
const SUFIXOS_COMPARTILHADOS = new Set([
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'co.jp', 'co.nz', 'co.za', 'com.ar', 'com.mx', 'com.pt',
  'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'herokuapp.com', 'web.app', 'firebaseapp.com', 'pages.dev', 'workers.dev', 'blogspot.com',
  'appspot.com', 'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 's3.amazonaws.com', 'onrender.com', 'fly.dev', 'glitch.me', 'repl.co',
]);

function novoRelatorio() {
  return { invisiveis: 0, ocultos: 0, comentarios: 0, scripts: 0, tags: 0, imagens: 0, links: 0, urls: 0, descartados: 0 };
}
const ALERTAS = ['invisiveis', 'ocultos', 'comentarios', 'scripts', 'imagens', 'links', 'urls', 'descartados'];

/** Remove caracteres invisíveis e de controle (menos \n e \t). */
export function removerInvisiveis(texto) {
  return String(texto).replace(/\r\n?/g, '\n').replace(INVISIVEIS, '');
}

// ---------------------------------------------------------------------------------------------------------------------------------
// HTML: varredura linear, com aspas nos atributos e aninhamento
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lê uma tag que começa em t[i] === '<'. Devolve null se não houver `>` dentro do limite. */
function lerTag(t, i, orc) {
  const c = t[i + 1];
  if (c === undefined || !/[A-Za-z/!?]/.test(c)) return null;
  let aspas = null;
  const max = Math.min(t.length, i + LIMITE_TAG);
  let j = i + 1;
  for (; j < max; j++) {
    if ((orc.passos += 1) > ORCAMENTO_DE_PASSOS) throw ESTOUROU;
    const ch = t[j];
    if (aspas) { if (ch === aspas) aspas = null; continue; }
    if (ch === '"' || ch === "'") { aspas = ch; continue; }
    if (ch === '>') break;
  }
  if (j >= max || t[j] !== '>') return null;
  const interior = t.slice(i + 1, j);
  const m = /^(\/?)([A-Za-z][A-Za-z0-9:-]*)?/.exec(interior);
  return {
    fim: j + 1,
    fechamento: m[1] === '/',
    nome: (m[2] ?? '').toLowerCase(),
    atributos: interior.slice(m[0].length),
    autoFecha: /\/\s*$/.test(interior),
  };
}

function valorAtributo(atributos, nome) {
  const m = new RegExp(`(?:^|[\\s"'/])${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i').exec(atributos);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

function propriedades(estilo) {
  const mapa = new Map();
  for (const decl of estilo.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const k = decl.indexOf(':');
    if (k < 0) continue;
    const nome = decl.slice(0, k).trim().toLowerCase();
    if (nome) mapa.set(nome, decl.slice(k + 1).replace(/!\s*important/i, '').trim().toLowerCase());
  }
  return mapa;
}
const numero = (v) => { const m = /^(-?\d*\.?\d+)/.exec(v ?? ''); return m ? parseFloat(m[1]) : NaN; };

/** Estilo inline que esconde o elemento da pessoa (os casos simples; classes e folhas de estilo externas escapam). */
function ocultoPorEstilo(estilo) {
  const p = propriedades(estilo);
  const v = (k) => p.get(k);
  const corta = ['hidden', 'clip'].some((x) => [v('overflow'), v('overflow-x'), v('overflow-y')].includes(x));
  if (v('display') === 'none') return true;
  if (['hidden', 'collapse'].includes(v('visibility'))) return true;
  if (numero(v('opacity')) === 0) return true;
  const fonte = v('font-size');
  const tamanho = numero(fonte);
  if (tamanho === 0) return true;
  if (/(?:px|pt)$/.test(fonte ?? '') && tamanho <= 1) return true; // 1px é "invisível" na prática
  if (/(?:em|rem)$/.test(fonte ?? '') && tamanho <= 0.1) return true;
  if ((numero(v('height')) === 0 || numero(v('max-height')) === 0) && corta) return true;
  if ((numero(v('width')) === 0 || numero(v('max-width')) === 0) && corta) return true;
  if (['absolute', 'fixed'].includes(v('position')) && ['left', 'right', 'top', 'bottom'].some((l) => numero(v(l)) <= -500)) return true;
  if (numero(v('text-indent')) <= -500) return true;
  if (/scale\(\s*0(?:\.0+)?\s*(?:,\s*0(?:\.0+)?\s*)?\)/.test(v('transform') ?? '')) return true;
  if (/rect\(\s*0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?\s*\)/.test(v('clip') ?? '')) return true;
  if (/inset\(\s*(?:50|100)%/.test(v('clip-path') ?? '')) return true;
  const cor = (v('color') ?? '').replace(/\s+/g, '');
  if (cor === 'transparent' || /^rgba\([^)]*,0(?:\.0+)?\)$/.test(cor)) return true;
  return false;
}
const corClara = (estilo) => ['white', '#fff', '#ffffff', 'rgb(255,255,255)'].includes((propriedades(estilo).get('color') ?? '').replace(/\s+/g, ''));

function escondida(tag) {
  const estilo = valorAtributo(tag.atributos, 'style');
  if (estilo !== null && ocultoPorEstilo(estilo)) return true;
  // atributo booleano `hidden` (a presença basta); valores entre aspas não contam, nem `aria-hidden` nem `type=hidden`
  const semValores = tag.atributos.replace(/"[^"]*"|'[^']*'/g, '""');
  return /(?:^|\s)hidden(?=\s|$|=|\/)/i.test(semValores);
}

/** Acha o fechamento do elemento aberto, contando elementos aninhados do mesmo nome. Devolve o índice depois do fechamento, ou -1. */
function acharFechamento(t, nome, desde, falhas, orc) {
  if (falhas.has(nome) && falhas.get(nome) <= desde) return -1; // já se viu que, daqui para a frente, não fecha: evita varredura quadrática
  let profundidade = 1;
  let i = desde;
  for (;;) {
    const lt = t.indexOf('<', i);
    if (lt < 0) break;
    const tag = lerTag(t, lt, orc);
    if (!tag) { i = lt + 1; continue; }
    if (tag.nome === nome) {
      if (tag.fechamento) { profundidade -= 1; if (profundidade === 0) return tag.fim; } else if (!tag.autoFecha) profundidade += 1;
    }
    i = tag.fim;
  }
  falhas.set(nome, desde);
  return -1;
}

/**
 * Tira o HTML: comentários, script/style, elementos escondidos (com o que há dentro) e as tags (fica o texto). Na saída (`agressivo`),
 * um `<` que parece começo de tag e nunca fecha leva a linha toda junto.
 */
function tirarHtml(t, r, sinais, { agressivo }) {
  let saida = '';
  let pos = 0;
  let i = 0;
  const falhas = new Map();
  const orc = { passos: 0 };
  try {
  for (;;) {
    const lt = t.indexOf('<', i);
    if (lt < 0) break;
    if (t.startsWith('<!--', lt)) { // comentário; sem fechamento, o navegador levaria o resto junto
      const fim = t.indexOf('-->', lt + 4);
      saida += t.slice(pos, lt);
      r.comentarios += 1;
      if (fim < 0) { pos = t.length; i = pos; break; }
      pos = fim + 3; i = pos;
      continue;
    }
    const tag = lerTag(t, lt, orc);
    if (!tag) {
      if (agressivo && /[A-Za-z/!?]/.test(t[lt + 1] ?? '')) { // abre e nunca fecha: leva até o fim da linha
        const nl = t.indexOf('\n', lt);
        saida += t.slice(pos, lt);
        r.tags += 1;
        pos = nl < 0 ? t.length : nl; i = pos;
      } else i = lt + 1;
      continue;
    }
    saida += t.slice(pos, lt);
    if (!tag.fechamento && BLOCOS_INERTES.has(tag.nome)) {
      r.scripts += 1;
      const f = acharFechamento(t, tag.nome, tag.fim, falhas, orc);
      if (f < 0) { pos = t.length; i = pos; break; }
      pos = f; i = pos;
      continue;
    }
    if (!tag.fechamento && escondida(tag)) {
      r.ocultos += 1;
      if (TAG_VAZIA.has(tag.nome) || tag.autoFecha) { pos = tag.fim; i = pos; continue; }
      const f = acharFechamento(t, tag.nome, tag.fim, falhas, orc);
      if (f < 0) { pos = t.length; i = pos; break; } // nunca fecha: descarta o resto
      pos = f; i = pos;
      continue;
    }
    if (!tag.fechamento) {
      const estilo = valorAtributo(tag.atributos, 'style');
      if (estilo !== null && corClara(estilo)) sinais.corClara += 1;
    }
    r.tags += 1;
    pos = tag.fim; i = pos;
  }
  } catch (e) {
    if (e !== ESTOUROU) throw e;
    r.descartados += 1;
    return `${saida}${t.slice(pos, i)}[resto do texto removido: HTML grande ou estranho demais para limpar com segurança]`;
  }
  return saida + t.slice(pos);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------------------------------------------

function prepara(texto, removidos) {
  let t = String(texto).replace(/\r\n?/g, '\n');
  const truncado = t.length > MAX_CARACTERES;
  if (truncado) t = t.slice(0, MAX_CARACTERES);
  t = t.replace(INVISIVEIS, () => { removidos.invisiveis += 1; return ''; });
  return { t, truncado };
}
function fechar(texto, removidos, sinais, truncado, { saida }) {
  const suspeito = truncado || sinais.corClara > 0 || ALERTAS.some((k) => removidos[k] > 0) || (saida && removidos.tags > 0);
  return { texto, removidos, sinais, suspeito, truncado };
}

/**
 * Prepara texto NÃO confiável (e-mail, página, convite) antes de entregá-lo a um modelo: tira invisíveis, elementos escondidos
 * (heurística), comentários, script/style e as tags. Mantém as URLs (quem lê o conteúdo pode precisar delas).
 * @returns {{texto: string, removidos: object, sinais: {corClara: number}, suspeito: boolean, truncado: boolean}}
 */
export function limparEntrada(texto) {
  const removidos = novoRelatorio();
  const sinais = { corClara: 0 };
  const { t, truncado } = prepara(texto, removidos);
  return fechar(tirarHtml(t, removidos, sinais, { agressivo: false }), removidos, sinais, truncado, { saida: false });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------------------------------------------------------------

/** Domínios permitidos viram uma lista de nomes em minúsculas, sem ponto inicial. */
function normalizarDominios(lista) {
  if (!Array.isArray(lista)) throw new TypeError('dominiosPermitidos deve ser uma lista de nomes de domínio');
  return lista.map((d) => {
    const s = String(d).trim().toLowerCase().replace(/^\.+/, '');
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(s)) throw new RangeError(`domínio inválido na lista de permissão: ${JSON.stringify(String(d).slice(0, 60))}`);
    if (SUFIXOS_COMPARTILHADOS.has(s)) throw new RangeError(`${s} é sufixo público ou hospedagem compartilhada: liberá-lo libera qualquer pessoa que registre um nome embaixo (use o domínio exato do seu serviço)`);
    return s;
  });
}

/** Só http e https, e só o nome do host (o que está antes de `@` NÃO conta; `exemplo.com.atacante.net` não é `exemplo.com`; `\` é recusado). */
function hostPermitido(url, dominios) {
  if (dominios.length === 0 || url.includes('\\')) return false;
  let u;
  try { u = new URL(url.replace(/[.,;:!?]+$/, '').replace(/^\/\//, 'https://')); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  return dominios.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Índice do `close` que fecha o `open` de t[ini], contando aninhamento (e `\` como escape); -1 se não fechar dentro do limite. */
function fecharPar(t, ini, open, close, limite, orc) {
  let prof = 0;
  const max = Math.min(t.length, ini + limite);
  for (let i = ini; i < max; i++) {
    if ((orc.passos += 1) > ORCAMENTO_DE_PASSOS) throw ESTOUROU;
    const c = t[i];
    if (c === '\\') { i += 1; continue; }
    if (c === open) prof += 1;
    else if (c === close) { prof -= 1; if (prof === 0) return i; }
  }
  return -1;
}

/** Fim do destino de um link ou imagem markdown: t[abre] é "(". Aceita <destino com espaços>, parênteses em pares e título entre aspas. */
function fimDoDestino(t, abre, orc) {
  const max = Math.min(t.length, abre + LIMITE_DESTINO);
  let prof = 1;
  let comeco = true;
  for (let i = abre + 1; i < max; i++) {
    if ((orc.passos += 1) > ORCAMENTO_DE_PASSOS) throw ESTOUROU;
    const c = t[i];
    if (c === '\\') { i += 1; comeco = false; continue; }
    if (c === '<' && comeco) { const f = t.indexOf('>', i + 1); if (f < 0 || f >= max) return -1; i = f; comeco = false; continue; }
    if (!/\s/.test(c)) comeco = false;
    if ((c === '"' || c === "'") && /\s/.test(t[i - 1] ?? '')) { const f = t.indexOf(c, i + 1); if (f < 0 || f >= max) return -1; i = f; continue; }
    if (c === '(') prof += 1;
    else if (c === ')') { prof -= 1; if (prof === 0) return i; }
  }
  return -1;
}

function urlDoDestino(destino) {
  const d = destino.trim();
  if (d.startsWith('<')) return d.slice(1, d.indexOf('>') < 0 ? undefined : d.indexOf('>')).trim();
  return d.split(/\s/)[0];
}

/**
 * Varre markdown: imagens somem, links só ficam se o domínio for permitido. Faz uma varredura (não uma regex única) porque o markdown
 * aceita colchetes aninhados, destino entre <> com espaço, parênteses em pares e rótulos longos. O rótulo de um link também é limpo
 * (uma imagem dentro de um link vazaria do mesmo jeito).
 */
function varrerMarkdown(t, dominios, r, orc = { passos: 0 }, profundidade = 0) {
  let saida = '';
  let i = 0;
  try {
  while (i < t.length) {
    const imagem = t[i] === '!' && t[i + 1] === '[';
    if (imagem || t[i] === '[') {
      const abre = imagem ? i + 1 : i;
      const fechaRotulo = fecharPar(t, abre, '[', ']', LIMITE_ROTULO, orc);
      if (fechaRotulo > 0) {
        const rotulo = t.slice(abre + 1, fechaRotulo);
        const depois = fechaRotulo + 1;
        if (t[depois] === '(') {
          const fim = fimDoDestino(t, depois, orc);
          if (fim > 0) {
            if (imagem) { r.imagens += 1; saida += '[imagem removida]'; } else {
              const url = urlDoDestino(t.slice(depois + 1, fim));
              if (url && hostPermitido(url, dominios)) saida += `${profundidade < 3 ? varrerMarkdown(rotulo, dominios, r, orc, profundidade + 1) : ''} (${url})`;
              else { r.links += 1; saida += `${profundidade < 3 ? varrerMarkdown(rotulo, dominios, r, orc, profundidade + 1) : ''} [link removido]`; }
            }
            i = fim + 1;
            continue;
          }
        } else if (t[depois] === '[') {
          const fimRef = t.indexOf(']', depois + 1);
          if (fimRef > 0 && fimRef - depois <= 200) {
            if (imagem) { r.imagens += 1; saida += '[imagem removida]'; } else { r.links += 1; saida += `${profundidade < 3 ? varrerMarkdown(rotulo, dominios, r, orc, profundidade + 1) : ''} [link removido]`; }
            i = fimRef + 1;
            continue;
          }
        }
        if (imagem) { r.imagens += 1; saida += '[imagem removida]'; i = fechaRotulo + 1; continue; } // ![alt] sozinho pode ser imagem de referência
      }
    }
    saida += t[i];
    i += 1;
  }
  } catch (e) {
    if (e !== ESTOUROU || profundidade > 0) throw e;
    r.descartados += 1;
    return `${saida}[resto do texto removido: grande ou estranho demais para limpar com segurança]`;
  }
  return saida;
}

/**
 * Limpa a SAÍDA do modelo antes de mostrá-la (Telegram, tela, e-mail): sem imagens, sem HTML, sem caracteres invisíveis e sem
 * links, exceto os de domínios que você liberou. Devolve também o que foi removido, para você registrar e alertar.
 * @param {string} texto
 * @param {{dominiosPermitidos?: string[]}} [opcoes]
 * @returns {{texto: string, removidos: object, sinais: {corClara: number}, suspeito: boolean, truncado: boolean}}
 */
export function limparSaidaDoModelo(texto, { dominiosPermitidos = [] } = {}) {
  const dominios = normalizarDominios(dominiosPermitidos);
  const removidos = novoRelatorio();
  const sinais = { corClara: 0 };
  const pre = prepara(texto, removidos);
  // 'ｈｔｔｐｓ://' (largura total) vira ASCII antes de procurar endereços
  let t = tirarHtml(pre.t, removidos, sinais, { agressivo: true }).replace(LARGURA_TOTAL, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  // definições de referência ([ref]: url), mesmo dentro de citação ou lista
  t = t.replace(/^[ \t>*+\-\d.]{0,12}\[[^\]\n]{1,500}\]:[ \t]*\S[^\n]{0,2000}$/gm, () => { removidos.links += 1; return ''; });
  t = varrerMarkdown(t, dominios, removidos);
  // endereços soltos: esquema:..., //host, www. e host.tld/caminho
  t = t.replace(URL_SOLTA, (url) => {
    if (hostPermitido(/^[A-Za-z][A-Za-z0-9+.-]*\s*:/.test(url) || url.startsWith('//') ? url : `https://${url}`, dominios)) return url;
    removidos.urls += 1;
    return '[link removido]';
  });
  return fechar(t, removidos, sinais, pre.truncado, { saida: true });
}
