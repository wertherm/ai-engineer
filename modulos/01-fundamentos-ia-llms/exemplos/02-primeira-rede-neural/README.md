# Exemplo 02 · Primeira rede neural do zero (dados → treino → validação → inferência)

**Conceito novo:** o ciclo completo de ML supervisionado em JS: gerar e dividir dados (treino/validação/teste),
definir a rede, treinar com gradiente (Adam + binary cross-entropy), validar a cada época, medir no teste
(acurácia, matriz de confusão, precisão, recall) e fazer inferência em pontos novos.

**Pré-requisito:** [exemplo 01](../01-tensores/) (tensores). Não precisa de Ollama nem Postgres.

O problema: dado um ponto `(x, y)`, ele está dentro do círculo de raio 0,6? Uma reta não separa as classes,
então a camada oculta com ReLU é necessária. Tudo é semeado (`criarRng`, `glorotUniform({ seed })`,
`shuffle: false`) para a saída ser reprodutível.

## Como rodar

```bash
cd modulos/01-fundamentos-ia-llms
npm run ex02        # = node exemplos/02-primeira-rede-neural/main.js
npm test            # testes do gerador de dados (node --test)
```

## Saída esperada

Saída real (sem a faixa de aviso do tfjs-node):

```text
[dados] treino=700 validação=150 teste=150
[dados] classe 1 (dentro do círculo) no treino: 31.1%
[dados] baseline (sempre a classe majoritária): 68.9%
[modelo] parâmetros treináveis: 65 (2·16+16 + 16·1+1)
[treino] época  1 loss=0.5324 acc=0.681 | val_loss=0.4355 val_acc=0.727
[treino] época 10 loss=0.0841 acc=0.983 | val_loss=0.1054 val_acc=0.980
[treino] época 20 loss=0.0519 acc=0.989 | val_loss=0.0704 val_acc=0.987
...
[treino] época 60 loss=0.0235 acc=0.994 | val_loss=0.0388 val_acc=1.000
[treino] concluído em 1.4s
[teste] loss=0.0301 acurácia=99.3%
[teste] matriz de confusão: VP=44 FP=1 FN=0 VN=105
[teste] precisão=0.978 recall=1.000
[inferência] (0, 0) -> P(dentro)=1.000 | resposta certa: dentro
[inferência] (0.3, 0.3) -> P(dentro)=1.000 | resposta certa: dentro
[inferência] (0.5, 0.5) -> P(dentro)=0.018 | resposta certa: fora
[inferência] (0.9, -0.9) -> P(dentro)=0.000 | resposta certa: fora
[inferência] (0.59, 0) -> P(dentro)=0.807 | resposta certa: dentro
```

Leitura: o baseline "chutar sempre fora" já dá 68,9%. A rede vale porque chega a 99,3% no **teste**
(dados nunca vistos). O ponto `(0.59, 0)` fica quase na borda e a confiança cai para 0,807: é ali que a rede erra.

## Experimente

1. Troque `units: 16` por `units: 2`: a fronteira fica "quadrada" e a acurácia cai. Por quê?
2. Remova a camada oculta (deixe só a de saída com `inputShape: [2]`): vira regressão logística, que só traça
   uma reta. Compare com o baseline.
3. Suba `adam(0.05)` para `adam(1)` e veja a loss oscilar ou explodir (taxa de aprendizado alta demais).

## Versão Python

Rede escrita **à mão em NumPy** ([`comum_py/rede.py`](../../comum_py/rede.py)): forward, backprop pela regra da
cadeia e Adam, sem framework. Os dados são **idênticos** aos do JS: o `mulberry32` foi portado bit a bit
([`comum_py/dados.py`](../../comum_py/dados.py)), e um teste confere os primeiros números contra o Node. A
inicialização Glorot usa o gerador do NumPy (sementes 1 e 2 por camada), então os pesos iniciais diferem do
TF.js e as métricas ficam próximas, não iguais. Um *gradient check* no pytest confere o backprop contra a
derivada numérica.

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/02-primeira-rede-neural/python/main.py
uv run pytest exemplos/02-primeira-rede-neural/python   # 5 testes (dados + gradient check)
```

**Saída esperada (Python)** — saída real:

```text
[dados] treino=700 validação=150 teste=150
[dados] classe 1 (dentro do círculo) no treino: 31.1%
[dados] baseline (sempre a classe majoritária): 68.9%
[modelo] parâmetros treináveis: 65 (2·16+16 + 16·1+1)
[treino] época  1 loss=0.5090 acc=0.690 | val_loss=0.4073 val_acc=0.773
[treino] época 10 loss=0.0830 acc=0.979 | val_loss=0.0935 val_acc=0.993
[treino] época 20 loss=0.0477 acc=0.987 | val_loss=0.0586 val_acc=0.993
...
[treino] época 60 loss=0.0216 acc=0.994 | val_loss=0.0260 val_acc=1.000
[treino] concluído em 0.1s
[teste] loss=0.0310 acurácia=98.7%
[teste] matriz de confusão: VP=44 FP=2 FN=0 VN=104
[teste] precisão=0.957 recall=1.000
[inferência] (0, 0) -> P(dentro)=1.000 | resposta certa: dentro
[inferência] (0.3, 0.3) -> P(dentro)=1.000 | resposta certa: dentro
[inferência] (0.5, 0.5) -> P(dentro)=0.006 | resposta certa: fora
[inferência] (0.9, -0.9) -> P(dentro)=0.000 | resposta certa: fora
[inferência] (0.59, 0) -> P(dentro)=0.857 | resposta certa: dentro
```

Comparação no mesmo conjunto de teste: JS 99,3% (1 falso positivo) × Python 98,7% (2 falsos positivos). Mesmo
dado, mesma arquitetura e mesmo otimizador; só a inicialização dos pesos mudou. O treino leva 0,1 s contra
1,4 s do TF.js puro: NumPy vetoriza em C, o backend `cpu` do TF.js roda em JavaScript.
