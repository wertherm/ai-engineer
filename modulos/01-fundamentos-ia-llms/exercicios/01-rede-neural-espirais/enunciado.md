# Exercício 01 · Rede neural para 3 espirais (multiclasse)

## Contexto

No [exemplo 02](../../exemplos/02-primeira-rede-neural/) a rede respondia "sim/não" (dentro do círculo).
Agora são **3 classes** em forma de espirais entrelaçadas: um problema clássico em que um modelo linear
fracassa e uma camada oculta pequena resolve.

## Requisitos

1. Gere 200 pontos por classe (600 no total) em 3 espirais com ruído, de forma **reprodutível** (reuse o
   `criarRng` de `exemplos/02-primeira-rede-neural/dados.js`) e **embaralhe** antes de dividir 70/15/15.
2. Saída com 3 neurônios `softmax`, rótulos `tf.oneHot`, loss `categoricalCrossentropy`.
3. Compare pelo menos 3 arquiteturas (incluindo uma **sem** camada oculta) e escolha a melhor usando só a
   acurácia de **validação**.
4. Só depois da escolha, informe a acurácia no **teste** e faça inferência em 3 pontos novos com `argMax`.

## Critério de pronto

- O modelo linear fica perto de 50% (bem abaixo de uma rede com camada oculta).
- A arquitetura escolhida passa de 90% no teste.
- Rodar duas vezes dá o mesmo resultado.

## Dicas

- Espiral: `r = i / n`, `theta = c * 2π/3 + r * 4 + ruído`, ponto `(r·sin θ, r·cos θ)`.
- Sem embaralhar, a fatia de treino teria só as classes 0 e 1 (os dados vêm ordenados por classe).
- No `tf.sequential`, a **primeira** camada precisa de `inputShape`; sem camada oculta, essa é a de saída
  (senão: `ValueError: The first layer in a Sequential model must get an inputShape`).

## Solução

[`solucao/main.js`](solucao/main.js). Rode com `npm run exercicio01`. Saída real (≈45 s em CPU):

```text
treino=420 validação=90 teste=90 | baseline (chute) ≈ 33.3%
sem oculta (linear)  params=    9 acc_treino=0.536 acc_val=0.533
1x16                 params=   99 acc_treino=0.993 acc_val=1.000
2x32                 params= 1251 acc_treino=0.993 acc_val=1.000

escolhido pela validação: 1x16 -> acurácia no TESTE = 100.0%
ponto [0,0.5] -> classe 2 (probs 0.01, 0.00, 0.99)
ponto [-0.5,-0.20000000298023224] -> classe 1 (probs 0.00, 1.00, 0.00)
ponto [0.30000001192092896,-0.6000000238418579] -> classe 0 (probs 1.00, 0.00, 0.00)
```

Empate na validação entre `1x16` e `2x32`: a solução fica com o primeiro (o mais simples, 99 parâmetros
contra 1251). Navalha de Occam aplicada a redes neurais.
