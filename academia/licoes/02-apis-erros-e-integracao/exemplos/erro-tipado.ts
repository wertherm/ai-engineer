// O que os tipos de TypeScript fazem (e o que NÃO fazem). Rode:  node academia/licoes/02-apis-erros-e-integracao/exemplos/erro-tipado.ts
// (Node 22.18+ ou 24+: o Node só APAGA os tipos e executa; quem confere é o tsc, veja kit/tsconfig.json.)

// 1) Uma união discriminada: `ok` decide qual das duas formas o objeto tem; `tipo` é um conjunto FECHADO de nomes.
type TipoDeErro = 'rede' | 'timeout' | 'servidor' | 'limite_de_taxa' | 'autenticacao' | 'cota_esgotada';
type Resultado =
  | { ok: true; texto: string }
  | { ok: false; erro: { tipo: TipoDeErro; mensagem: string } };

// 2) Verificação de exaustividade: se alguém acrescentar um tipo ao conjunto e esquecer de tratá-lo, o `tsc` aponta ESTA linha.
function impossivel(valor: never): never {
  throw new Error(`caso não tratado: ${JSON.stringify(valor)}`);
}

function oQueFazer(r: Resultado): string {
  if (r.ok) return `usar o texto: ${r.texto}`; // aqui o compilador SABE que `r.texto` existe
  switch (r.erro.tipo) {
    case 'rede':
    case 'timeout':
    case 'servidor':
      return 'esperar um pouco e tentar de novo';
    case 'limite_de_taxa':
      return 'esperar o Retry-After e tentar de novo';
    case 'autenticacao':
      return 'parar e avisar: a chave está errada';
    case 'cota_esgotada':
      return 'parar e avisar: acabou o crédito (esperar não resolve)';
    default:
      return impossivel(r.erro.tipo);
  }
}

const exemplos: Resultado[] = [
  { ok: true, texto: 'Olá' },
  { ok: false, erro: { tipo: 'limite_de_taxa', mensagem: 'HTTP 429' } },
  { ok: false, erro: { tipo: 'cota_esgotada', mensagem: 'HTTP 429 de cota' } },
];
for (const r of exemplos) console.log(oQueFazer(r));

// 3) Os tipos NÃO validam dados de fora. `as` é uma promessa sua ao compilador; o JSON que chegou da rede pode ser qualquer coisa.
const doServidor = JSON.parse('{"ok": true}') as Resultado; // o tsc aceita: JSON.parse devolve `any`
console.log(oQueFazer(doServidor)); // imprime "usar o texto: undefined": o compilador acreditou numa promessa falsa

// Experimentos:
//  a) acrescente 'truncado' a TipoDeErro. `node` roda igual; `tsc --noEmit` reclama em `impossivel(r.erro.tipo)`.
//  b) troque 'rede' por 'redee' em um dos objetos de `exemplos`: `node` roda; `tsc` reclama.
//  c) por isso o cliente da lição confere a forma da resposta com código (typeof, JSON.parse em try/catch) além de declarar tipos.
