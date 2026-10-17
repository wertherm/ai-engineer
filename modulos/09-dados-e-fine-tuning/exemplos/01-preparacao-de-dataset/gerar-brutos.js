// Gera os DADOS BRUTOS (100% SINTÉTICOS) de tickets de suporte da "Loja Exemplo", uma loja on-line fictícia.
// Os dados imitam a sujeira de uma exportação real de helpdesk: duplicatas, HTML de e-mail, dados pessoais,
// rótulos escritos de jeitos diferentes, tickets vazios e classes desbalanceadas. O exemplo 01 limpa tudo.
// Determinístico (semente fixa): rodar de novo gera exatamente o mesmo arquivo.
import fs from 'node:fs';
import path from 'node:path';
import { DADOS } from '../../comum/config.js';

// PRNG com semente (mulberry32) — Math.random() não aceita semente e quebraria a reprodutibilidade.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const aberturas = ['Olá,', 'Oi, boa tarde.', 'Bom dia!', 'Prezados,', 'Boa noite, pessoal.', '', '', 'Socorro!', 'Oi,'];
const fechos = ['Obrigado.', 'Aguardo retorno.', 'Grata!', 'Preciso de ajuda urgente.', '', '', 'Att.', 'Valeu!'];
const produtos = ['fone bluetooth', 'cafeteira', 'tênis de corrida', 'notebook', 'liquidificador', 'mochila', 'smartwatch', 'cadeira gamer'];

// Frases-núcleo por categoria: é o "sinal" que o modelo precisa aprender. {p} = produto, {n} = número.
const nucleos = {
  cobranca: [
    'fui cobrado duas vezes pelo pedido {n}', 'o boleto do pedido {n} venceu e não consigo gerar outro',
    'a fatura do cartão veio com um valor maior que o do {p}', 'paguei via pix e o pedido {n} continua como pendente de pagamento',
    'quero o reembolso do valor cobrado a mais', 'o desconto do cupom não foi aplicado na cobrança',
    'apareceu uma cobrança que eu não reconheço no meu cartão', 'o estorno do {p} ainda não caiu na minha conta',
    'parcelei em 3x mas cobraram à vista', 'a nota fiscal do pedido {n} está com valor errado',
  ],
  acesso: [
    'não consigo entrar na minha conta', 'esqueci a senha e o e-mail de recuperação não chega',
    'minha conta foi bloqueada depois de errar a senha', 'o código de verificação por SMS não chega',
    'o app fica pedindo login toda hora', 'alguém trocou a senha da minha conta sem eu saber',
    'não consigo alterar o e-mail cadastrado', 'aparece erro 403 quando tento acessar meus pedidos',
    'o login com Google parou de funcionar', 'minha sessão expira assim que eu faço login',
  ],
  entrega: [
    'meu pedido {n} está atrasado há {d} dias', 'o rastreio do {p} não atualiza desde semana passada',
    'o pedido {n} consta como entregue mas não recebi nada', 'a transportadora disse que meu endereço não existe',
    'quero mudar o endereço de entrega do pedido {n}', 'o prazo de entrega do {p} passou e ninguém responde',
    'recebi o pedido de outra pessoa no lugar do meu', 'o entregador deixou o pacote com o vizinho errado',
    'o {p} ficou parado no centro de distribuição', 'qual a previsão de chegada do pedido {n}?',
  ],
  defeito: [
    'o {p} chegou quebrado', 'o {p} parou de funcionar depois de {d} dias de uso',
    'a tela do {p} veio com manchas', 'o {p} não liga de jeito nenhum', 'veio faltando uma peça do {p}',
    'o {p} esquenta demais e desliga sozinho', 'o carregador do {p} não funciona',
    'o {p} veio com a embalagem violada e arranhado', 'o botão do {p} está travado', 'o {p} faz um barulho estranho',
  ],
  cancelamento: [
    'quero cancelar o pedido {n}', 'desisti da compra do {p}, como cancelo?',
    'quero cancelar minha assinatura do clube de frete', 'comprei por engano, preciso cancelar antes do envio',
    'quero exercer o direito de arrependimento do {p}', 'como cancelo o pedido {n} que ainda não foi enviado?',
    'quero encerrar minha conta e cancelar tudo', 'cancelem o pedido {n}, achei mais barato em outro lugar',
  ],
};

// Desbalanceamento realista: entrega domina, cancelamento é raro.
const pesos = { entrega: 0.38, cobranca: 0.24, acesso: 0.16, defeito: 0.13, cancelamento: 0.09 };
// Como cada time escreveu o rótulo no helpdesk ao longo dos anos (precisa padronizar).
const variantesRotulo = {
  cobranca: ['cobranca', 'Cobrança', 'COBRANCA', 'financeiro', ' cobrança '],
  acesso: ['acesso', 'Acesso', 'login', 'ACESSO'],
  entrega: ['entrega', 'Entrega', 'logistica', 'ENTREGA ', 'Logística'],
  defeito: ['defeito', 'Defeito', 'produto com defeito', 'troca'],
  cancelamento: ['cancelamento', 'Cancelamento', 'CANCELAR'],
};

function sortearCategoria() {
  let r = rand();
  for (const [cat, p] of Object.entries(pesos)) { if ((r -= p) <= 0) return cat; }
  return 'entrega';
}

function montarTexto(cat) {
  const nucleo = pick(nucleos[cat])
    .replace('{p}', pick(produtos))
    .replace('{n}', String(10000 + Math.floor(rand() * 90000)))
    .replace('{d}', String(2 + Math.floor(rand() * 20)));
  const frase = nucleo.charAt(0).toUpperCase() + nucleo.slice(1);
  return [pick(aberturas), frase + (frase.endsWith('?') ? '' : '.'), pick(fechos)].filter(Boolean).join(' ');
}

// Ruídos que aparecem em exportações reais.
function sujar(texto) {
  const r = rand();
  if (r < 0.12) return `<p>${texto.replace(/ /g, '&nbsp;')}</p><br>`; // corpo de e-mail em HTML
  if (r < 0.2) return `${texto} Meu e-mail é cliente${Math.floor(rand() * 999)}@exemplo.com.br`; // PII
  if (r < 0.27) return `${texto} CPF 123.456.789-0${Math.floor(rand() * 9)}, tel (11) 9${Math.floor(rand() * 9)}876-5432`; // PII
  if (r < 0.35) return `   ${texto.toUpperCase()}   `; // caixa alta e espaços
  return texto;
}

const registros = [];
let id = 1;
for (let i = 0; i < 420; i++) {
  const cat = sortearCategoria();
  const texto = sujar(montarTexto(cat));
  registros.push({ id: id++, canal: pick(['email', 'chat', 'app']), texto, categoria: pick(variantesRotulo[cat]) });
  // ~10% de duplicatas: o mesmo cliente reenvia o ticket (às vezes com espaços/caixa diferentes).
  if (rand() < 0.1) registros.push({ id: id++, canal: 'email', texto: rand() < 0.5 ? texto : ` ${texto.toLowerCase()}  `, categoria: pick(variantesRotulo[cat]) });
}
// Lixo que precisa ser descartado: texto vazio, curtíssimo, rótulo vazio ou fora do domínio.
registros.push(
  { id: id++, canal: 'chat', texto: '', categoria: 'entrega' },
  { id: id++, canal: 'chat', texto: 'ok', categoria: 'acesso' },
  { id: id++, canal: 'app', texto: 'teste teste', categoria: '' },
  { id: id++, canal: 'email', texto: 'Vocês vendem cartão-presente?', categoria: 'outros' },
  { id: id++, canal: 'email', texto: 'Parabéns pelo atendimento de ontem!', categoria: 'elogio' },
);

fs.mkdirSync(DADOS, { recursive: true });
const destino = path.join(DADOS, 'tickets-brutos.jsonl');
fs.writeFileSync(destino, registros.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`Gerados ${registros.length} tickets brutos (SINTÉTICOS) em ${path.relative(process.cwd(), destino)}`);
console.log('Exemplo de linha suja:', JSON.stringify(registros.find((r) => r.texto.startsWith('<p>'))));
