# Exercício 02 · Decision framework aplicado a 3 casos

## Contexto

Três áreas pediram "um modelo treinado com os nossos dados". Antes de gastar com dataset e treino, você precisa
recomendar a abordagem certa para cada uma — prompt, RAG, fine-tuning ou modelo maior — com justificativa e
custo mensal estimado. Base: [docs/01](../../docs/01-decision-framework.md).

1. **Jurídico:** responder dúvidas sobre 3.000 contratos que mudam toda semana (20 mil perguntas/mês, ~400 tokens de entrada, ~300 de saída).
2. **Suporte:** classificar 300 mil tickets/mês em 5 categorias com latência baixa (5.000 tickets já rotulados; ~80 tokens de entrada, 3 de saída).
3. **Financeiro:** parecer de crédito analisando 10 indicadores, 500 casos/mês, só 40 exemplos bons (~3.000 tokens de entrada, ~800 de saída).

## Requisitos

- Um script JS que descreve os casos como dados, aplica **regras explícitas** (auditáveis, não "achismo") e
  imprime a escolha + o porquê de cada caso.
- Custo mensal estimado das 4 opções para cada caso, com os preços oficiais (`gpt-4.1-nano` como modelo
  pequeno, `gpt-4.1-nano` fine-tunado, `gpt-4.1` como maior). Considere que few-shot adiciona ~600 tokens e RAG ~2.000.

## Critério de pronto

- As 3 recomendações saem do script e batem com a lógica do doc 01 (conhecimento → RAG; tarefa estreita +
  volume + exemplos → fine-tuning; raciocínio complexo + volume baixo → modelo maior).
- Cada caso mostra o custo das 4 opções, marcando a escolhida.

## Dicas

- A opção mais barata nem sempre é a escolhida: no jurídico, fine-tuning sai mais barato que RAG, mas congela contratos que mudam.
- No financeiro, 40 exemplos não sustentam um fine-tuning confiável; com 500 casos/mês, o modelo maior custa pouco.

## Saída real da solução

`node exercicios/02-decision-framework/solucao/decidir.js`

```text
Jurídico: responder dúvidas sobre 3.000 contratos que mudam toda semana
  -> RAG (modelo pequeno + 2k tokens de contexto)
     porquê: conhecimento muda e precisa de fonte: pesos congelam o conhecimento, o RAG atualiza no índice
       prompt (modelo pequeno + few-shot)             US$ 4.40/mês
     * RAG (modelo pequeno + 2k tokens de contexto)   US$ 12.20/mês
       fine-tuning (pequeno ajustado)                 US$ 6.40/mês
       modelo maior (sem ajuste)                      US$ 88.00/mês

Suporte: classificar 300 mil tickets/mês em 5 categorias, com latência baixa
  -> fine-tuning (pequeno ajustado)
     porquê: tarefa estreita, formato rígido, muitos exemplos e alto volume: o prompt encurta e o modelo pequeno basta
       prompt (modelo pequeno + few-shot)             US$ 20.76/mês
       RAG (modelo pequeno + 2k tokens de contexto)   US$ 62.76/mês
     * fine-tuning (pequeno ajustado)                 US$ 8.89/mês
       modelo maior (sem ajuste)                      US$ 415.20/mês

Financeiro: parecer de crédito com análise de 10 indicadores, 500 casos/mês
  -> modelo maior (sem ajuste)
     porquê: raciocínio complexo com volume baixo e poucos exemplos: pagar mais por chamada sai mais barato que montar dataset
       prompt (modelo pequeno + few-shot)             US$ 0.34/mês
       RAG (modelo pequeno + 2k tokens de contexto)   US$ 0.41/mês
       fine-tuning (pequeno ajustado)                 US$ 0.65/mês
     * modelo maior (sem ajuste)                      US$ 6.80/mês

(* = escolhida; custo não é o único critério: dados disponíveis, manutenção e risco pesam)
```
