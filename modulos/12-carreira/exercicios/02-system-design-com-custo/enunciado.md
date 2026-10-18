# Exercício 02 · System design de IA com estimativa de custo

## Contexto

Entrevista de system design, 45 minutos. O enunciado do entrevistador:

> "Nossa central de suporte tem **400 atendentes**, cada um trata **60 tickets por dia**, em **8 horas** de
> operação, **22 dias por mês**; o pico é **2,5×** a média. Queremos IA para: (1) **classificar** o ticket
> (categoria e prioridade); (2) **sugerir uma resposta** com base na base de conhecimento; (3) em ~**30%** dos
> tickets, consultar o **status do pedido** no sistema interno antes de sugerir. Quanto custa e como você
> desenharia?"

## Requisitos

1. `solucao/design.md`: requisitos (funcionais e não funcionais, com as premissas que você assumiu),
   diagrama Mermaid, tabela de trade-offs (escolha × alternativa descartada × motivo) e modos de falha.
2. `solucao/estimativa.js`: estimativa **por etapa** (classificar, sugerir, agente), reaproveitando
   `exemplos/05-system-design-rag/capacidade.js`: RPS de pico, concorrência, tokens/s de saída no pico,
   custo mensal, custo por ticket e qual etapa otimizar primeiro.
3. Premissas de tokens explícitas e comentadas. Preços: os ilustrativos do exemplo 05 (diga isso).

## Critério de pronto

- `npm run exe02` imprime a tabela por etapa e o total; `node --test exercicios/02-system-design-com-custo/` passa.
- O design responde: por que (ou por que não) usar agente em todos os tickets?

## Dicas

- Etapas diferentes têm perfis diferentes: classificar tem saída de ~30 tokens; sugerir carrega trechos do RAG.
- "Agente em 30% dos tickets" = 30% das requisições, com 2 chamadas extras cada.
- Em entrevista, diga as premissas em voz alta e confirme ("posso assumir 4 trechos de 300 tokens?").

## Saída real da solução

```text
etapa         RPS pico  concorr.  tok/s saída  US$/mês
classificar       2,08       3,1           63      105
sugerir           2,08      12,5          625      630
agente            0,63       5,0          150      208

TOTAL: US$ 943 /mês · US$ 0,0018 por ticket · 838 tok/s de saída no pico
Maior custo: "sugerir" -> é onde otimizar primeiro (menos trechos, cache, modelo menor se a avaliação deixar).
```

## Versão Python da solução

`solucao/python/estimativa.py` reaproveita `exemplos/05-system-design-rag/python/capacidade.py`;
`solucao/python/test_estimativa.py` é o teste pytest.

```bash
cd modulos/12-carreira
uv run python exercicios/02-system-design-com-custo/solucao/python/estimativa.py
uv run pytest exercicios/02-system-design-com-custo/
```

Saída real (2026-10-17), idêntica à do JS:

```text
etapa         RPS pico  concorr.  tok/s saída  US$/mês
classificar       2,08       3,1           63      105
sugerir           2,08      12,5          625      630
agente            0,63       5,0          150      208

TOTAL: US$ 943 /mês · US$ 0,0018 por ticket · 838 tok/s de saída no pico
Maior custo: "sugerir" -> é onde otimizar primeiro (menos trechos, cache, modelo menor se a avaliação deixar).
```
