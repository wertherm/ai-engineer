# 02 · Níveis de carreira, salário, negociação e promoção

## Objetivo

Ao terminar, você sabe dizer o que separa cada nível (Júnior → Principal) em escopo, autonomia, impacto e
liderança técnica; pesquisar o mercado antes de falar de dinheiro; negociar uma oferta pelo pacote completo; e
montar um pedido de aumento ou promoção com evidência medida.

## Explicação

### Expectativas por nível

Cada empresa tem a sua matriz (nomes e número de níveis variam), mas os **eixos** se repetem. A tabela é uma
síntese das matrizes públicas citadas nas fontes, não a régua de uma empresa específica.

| Nível | Escopo | Autonomia | Impacto | Liderança técnica | Em IA aplicada, por exemplo |
|---|---|---|---|---|---|
| Júnior | Tarefa bem definida | Precisa de direção e revisão | Na tarefa | Aprende, pede ajuda cedo | Implementa um endpoint de RAG desenhado por outra pessoa |
| Pleno | Feature / componente | Resolve sozinho problemas definidos | No time | Revisa código, ajuda júniores | Escolhe chunking e top-k medindo; escreve a avaliação da feature |
| Sênior | Sistema / projeto ambíguo | Define o "como" e negocia o "o quê" | No time e vizinhos | Decide arquitetura, conduz incidentes, mentora | Desenha o RAG multi-tenant com ACL, custo e SLO; cria o portão de avaliação |
| Staff | Vários times / domínio | Encontra os problemas certos | Na área / organização | Define direção técnica, alinha líderes | Plataforma de LLM compartilhada (gateway, avaliação, custo) para 5 times |
| Principal | Empresa / indústria | Define estratégia técnica de longo prazo | Na empresa | Referência interna e externa | Estratégia build vs. buy de modelos, governança de IA da empresa |

A mudança de **Pleno para Sênior** é a que mais reprova: não é "codar mais rápido", é lidar com ambiguidade e
fazer outras pessoas renderem. De **Sênior para Staff**, o trabalho vira escolher problemas e alinhar pessoas
(os "arquétipos" de Staff: tech lead, arquiteto, solver, braço direito).

### Expectativas salariais e proposta de valor

- **Pesquise antes**: faixas por cargo, nível, cidade/remoto e moeda em fontes com metodologia — por exemplo,
  levels.fyi (autodeclarado, forte em big techs), Glassdoor, a pesquisa anual do Stack Overflow e conversas com
  pessoas do mercado. Este módulo **não** traz valores: eles mudam rápido e variam por país e empresa; anote a
  fonte e a data de cada número que você usar.
- **Proposta de valor**: "o que você ganha me contratando", em uma frase com evidência. Ex.: "coloco LLM em
  produção com custo e qualidade medidos; no último projeto reduzi o custo por pergunta mantendo a avaliação".
- **Quando falar números**: o ideal é depois de a empresa querer você (fim do processo). Se perguntarem cedo,
  devolva a pergunta ("qual a faixa prevista para a vaga?") ou dê uma faixa **pesquisada** cujo piso você aceita.
  Em alguns lugares a faixa é obrigatória na vaga: use-a.

### Negociação salarial

- **Timing**: negocie com a oferta por escrito, nunca antes. Agradeça, peça o pacote completo e tempo para avaliar.
- **Âncoras**: o primeiro número puxa a conversa. Se for o seu, que seja o topo da faixa pesquisada, justificado
  pelo seu valor (não pela sua necessidade).
- **Múltiplas ofertas**: alavanca legítima, se forem reais. Diga a verdade ("tenho outra oferta, prefiro vocês;
  vocês conseguem chegar em X?"); blefe destrói confiança.
- **Pacote completo**: base, bônus, participação (ações/opções, com vesting), benefícios, regime de contratação
  (CLT × PJ no Brasil muda impostos e benefícios), remoto, orçamento de estudo e de conferências, data de início,
  nível/título (define o próximo aumento).
- **Peça em silêncio e espere**: fale o número e pare de falar.

### Pedido de aumento ou promoção

1. **Documente impacto continuamente** num *brag document*: data, entrega, número antes → depois, evidência.
   Você não lembra do que fez há 9 meses; o seu gestor menos ainda.
2. **Mapeie para a matriz**: agrupe a evidência pelos eixos do nível-alvo (impacto, escopo, liderança,
   execução) e ache o eixo vazio **antes** da conversa — é o que o comitê vai achar.
3. **Timing**: semanas antes do ciclo de avaliação (quando o orçamento é decidido), depois de uma entrega
   visível, nunca no meio de um incêndio.
4. **Apresentação**: uma página: pedido claro, 3–5 evidências com número, o que você já faz do próximo nível e
   o que você precisa para fechar a lacuna. Peça o critério por escrito se a resposta for "ainda não".

## Código mínimo

```js
// Caso de promoção a partir do brag document (exemplo 03)
for (const [eixo, expectativa] of Object.entries(EIXOS)) {
  const itens = brag.entradas.filter((e) => e.eixo === eixo);
  if (!itens.length) lacunas.push(eixo); // o buraco que o comitê vai achar
}
```

## Na prática

- [Exemplo 03 · STAR e brag document](../exemplos/03-star-e-brag-document/) (`caso-de-promocao.js`, `template-brag-document.md`)

## Armadilhas

- Confundir tempo de casa com nível: promoção é por escopo e impacto demonstrados, não por anos.
- Dar o primeiro número sem pesquisa, ou citar o salário atual como âncora.
- Negociar só a base e esquecer nível, bônus, participação e regime de contratação.
- Pedir aumento citando necessidade pessoal em vez de valor entregue.
- Usar número de mercado sem fonte e data (salário "que alguém disse").

## Fontes

- Dropbox Engineering Career Framework: https://dropbox.github.io/dbx-career-framework/
- StaffEng · arquétipos de Staff: https://staffeng.com/guides/staff-archetypes/ · promo packets: https://staffeng.com/guides/promo-packets/
- Julia Evans · Get your work recognized: write a brag document: https://jvns.ca/blog/brag-documents/
- Patrick McKenzie · Salary Negotiation: https://www.kalzumeus.com/2012/01/23/salary-negotiation/
- Tech Interview Handbook · Negotiation: https://www.techinterviewhandbook.org/negotiation/
- Stack Overflow Developer Survey 2025 · Work: https://survey.stackoverflow.co/2025/work
- levels.fyi (dados autodeclarados): https://www.levels.fyi/t/software-engineer
