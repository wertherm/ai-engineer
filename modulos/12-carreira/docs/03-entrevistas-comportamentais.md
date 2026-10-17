# 03 · Entrevistas de RH e comportamentais

## Objetivo

Ao terminar, você tem um banco de 5–8 histórias no formato STAR, contadas em 1,5–3 minutos, com a sua ação na
primeira pessoa e resultado medido; sabe mostrar alinhamento cultural sem decorar slogans; e responde "qual o
seu ponto fraco?" com honestidade estratégica.

## Explicação

Entrevista comportamental parte de uma premissa: **o comportamento passado prevê o futuro**. Por isso a
pergunta é "conte uma vez em que…", e não "o que você faria se…". A resposta boa é uma história específica.

### Método STAR

| Parte | O que dizer | Tempo |
|---|---|---|
| **S**ituação | Onde, quando, qual problema, por que importava | ~15% |
| **T**arefa | A **sua** responsabilidade | ~10% |
| **A**ção | O que **você** fez: decisão, alternativa descartada, como convenceu pessoas | ~50% |
| **R**esultado | Número antes → depois, efeito no negócio, o que aprendeu | ~25% |

O erro clássico é gastar metade do tempo no contexto e falar "nós" na ação. O entrevistador precisa saber o
que **você** fez. O [exemplo 03](../exemplos/03-star-e-brag-document/) valida essas regras em código.

### Storytelling efetivo

- Comece pela manchete ("reduzi o custo do assistente sem perder qualidade; vou contar como").
- Um conflito ou obstáculo por história: é o que a torna memorável.
- Números concretos e verificáveis; se não houver número, uma consequência observável.
- Termine com o aprendizado e o que faria diferente: mostra maturidade.
- Prepare histórias que sirvam a várias perguntas: projeto difícil, conflito técnico, falha/erro seu,
  decisão com informação incompleta, influência sem autoridade, mentoria, prazo apertado.

### Alinhamento cultural

Leia os valores publicados da empresa e o que os engenheiros de lá escrevem (blog técnico, palestras). Para cada
valor relevante, tenha **uma história sua** que o demonstre — citar o valor sem história soa decorado. Prepare
também as suas perguntas (como avaliam IA em produção? quem decide arquitetura? como é o on-call?): entrevista
é via de mão dupla.

### Pontos fracos

Escolha uma fraqueza **real**, que não seja central para a vaga, e mostre o plano em andamento com evidência.
Ex.: "eu demorava para pedir ajuda e perdia dias travado; hoje me dou 2 horas antes de perguntar e registro o
bloqueio na daily". Evite falsas fraquezas ("sou perfeccionista") e fraquezas que desqualificam
("não gosto de testes").

## Código mínimo

```js
// Checagens do validador STAR (exemplo 03)
'contexto (S+T) <= 30% do texto': contexto / total <= 0.3,
'ação na 1ª pessoa do singular': singular >= 2 && singular > plural,
'resultado com número': /\d/.test(h.resultado),
```

## Na prática

- [Exemplo 03 · STAR e brag document](../exemplos/03-star-e-brag-document/) (`template-star.md`, `validar-star.js`)

## Armadilhas

- História hipotética ("eu faria…") quando pediram um caso real.
- "Nós" do começo ao fim: o entrevistador não descobre o seu papel.
- Resultado vago ("ficou melhor"); ou número inventado que não resiste a uma pergunta de acompanhamento.
- Falar mal de empregador anterior.
- Decorar palavra por palavra: soa robótico. Decore a estrutura e os números.

## Fontes

- Tech Interview Handbook · Behavioral interviews: https://www.techinterviewhandbook.org/behavioral-interview/
- Google Careers · Interview tips: https://www.google.com/about/careers/applications/interview-tips/
- Julia Evans · brag documents (fonte das histórias): https://jvns.ca/blog/brag-documents/
