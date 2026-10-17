# Exercício 01 · Melhorar o dataset e medir o efeito

## Contexto

O time de suporte exportou mais tickets "para o modelo aprender mais", mas a exportação veio com **30% dos
rótulos errados** (anotadores diferentes) e com os tickets de **entrega triplicados** (reenvios). Você precisa
provar, com número, que limpar os dados vale mais do que ter mais dados. Base: [docs/02](../../docs/02-preparacao-de-datasets.md)
e [exemplo 03](../../exemplos/03-lora-peft-cpu/).

## Requisitos

1. Gere um treino **ruidoso** a partir de `dados/treino.jsonl`: troque o rótulo de 30% dos exemplos por outra
   categoria e triplique os de `entrega` (semente fixa).
2. Treine dois adapters LoRA com o **mesmo orçamento** (1 época, mesma semente e hiperparâmetros): um com o
   ruidoso e um com o limpo. Reuse `treinar()` do exemplo 03.
3. Avalie os dois no **mesmo** `dados/validacao.jsonl` limpo: acurácia e distribuição das previsões.
4. Explique o resultado: o que o ruído e o desbalanceamento fizeram com as previsões?

## Critério de pronto

- O script imprime acurácia e distribuição de previsões das duas variantes e a diferença.
- A variante limpa vence, mesmo com menos exemplos (178 × 256).

## Dicas

- Olhe a distribuição: o modelo ruidoso "chuta" a classe inflada.
- Com pouca RAM, rode cada variante num processo (`--so ruidoso`, depois `--so limpo`); o resultado acumula em `.cache/exercicio-01/resultados.json`.
- Com 1 época as acurácias são baixas; o exemplo 03 usa 2 épocas e chega a 67%. O que importa aqui é a **diferença** com orçamento igual.

## Saída real da solução

`uv run python exercicios/01-melhorar-dataset/solucao/comparar.py --so ruidoso` e depois `--so limpo`
(CPU disputada: 516 s e 379 s de treino):

```text
== treinando com o dataset ruidoso (256 exemplos, 1 época) ==
loss de validação 0.340 | acurácia 34.8% | 516 s | previsões {'cancelamento': 4, 'entrega': 38, 'defeito': 3, 'acesso': 1}

== treinando com o dataset limpo (178 exemplos, 1 época) ==
loss de validação 0.301 | acurácia 43.5% | 379 s | previsões {'cancelamento': 4, 'entrega': 24, 'acesso': 9, 'defeito': 8, 'cobranca': 1}

efeito da limpeza: 34.8% -> 43.5% de acurácia
```

**Leitura:** com ruído + entrega triplicada, 38 das 46 previsões viraram `entrega` (a classe inflada) e
`cobranca` sumiu. O limpo, com **menos** exemplos, distribui melhor e ganha 8,7 pontos. Mais dados ruins não ajudam.
