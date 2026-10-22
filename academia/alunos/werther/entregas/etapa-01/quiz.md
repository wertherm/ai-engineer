# Quiz · Lição 1

**Data:** 2026-10-22. Respondido de memória, **antes** de ler a microlição e de abrir o gabarito, e transcrito da
conversa com o tutor.

## Respostas

| Questão | Resposta | Confiança |
|---|---|---|
| Q1 | B | alta |
| Q2 | B | média |
| Q3 | B | baixa |
| Q4 | A | baixa |
| Q5 | C | baixa |
| Q6 | A | baixa |
| Q7 | Falso | baixa |
| Q8 | Por não enviar o payload da pergunta anterior. | baixa |
| Q9 | Enviar um ebook do Senhor dos Anéis acabará com a janela de contexto. | média |

## Correção (com o gabarito, depois de responder)

| Questão | Gabarito | Resultado |
|---|---|---|
| Q1 | B | certa |
| Q2 | B | certa |
| Q3 | B | certa |
| Q4 | C | errada |
| Q5 | B | errada |
| Q6 | B | errada |
| Q7 | Falso | certa, sem justificativa (completada abaixo) |
| Q8 | aberta | parcial: citou o reenvio, sem o porquê nem o como (reescrita abaixo) |
| Q9 | aberta | parcial: exemplo de texto que não cabe na janela; faltou o caso em que cabe e mesmo assim piora (custo, prefill, *Lost in the Middle*) |

**Calibragem:** as respostas com confiança alta ou média estavam todas certas; os três erros tiveram confiança baixa.
Subestimou Q3 e Q7 (certas com confiança baixa).

## Minhas anotações

As respostas erradas e incompletas foram chute. Correção com as minhas palavras, construída com o tutor:

- **Q4:** eu chutei; o certo é C (3.500) porque cada turno reenvia a pergunta (100) **e** a resposta (200) de cada
  turno anterior, 300 por turno, mais a pergunta nova (turno 3 = 2 × 300 + 100 = 700). Eu tinha esquecido que a
  resposta tem 200.
- **Q5:** eu chutei; o certo é B porque `length` significa que se atingiu o limite de saída de tokens ou o da janela
  de contexto, e a resposta vem cortada. Um JSON cortado dá erro no `JSON.parse`, então o código checa
  `if (finish_reason === 'length')` antes de usar a resposta.
- **Q6:** eu chutei; o certo é B porque o decode gera um token por vez, em sequência.
- **Q7:** é falso porque o servidor processa em lotes e o hardware muda os cálculos.
- **Q8:** a API é stateless; a aplicação reenvia todo o histórico em `messages`.
