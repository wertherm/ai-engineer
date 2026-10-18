# Exemplo 01 · Tensores com TensorFlow.js

**Conceito novo:** tensor (array N-dimensional com `shape` e `dtype`), broadcasting, produto de matrizes como
camada densa, gradiente automático e gestão de memória com `tf.tidy`.

**Pré-requisito:** `npm install` na pasta do módulo. Não precisa de Ollama nem Postgres.

## Como rodar

```bash
cd modulos/01-fundamentos-ia-llms
npm run ex01        # = node exemplos/01-tensores/main.js
```

## Saída esperada

Saída real (a faixa `Hi, looks like you are running TensorFlow.js in Node.js...` aparece no início; é só um
aviso sugerindo o `tfjs-node`, que **não** usamos porque quebra no Node 24):

```text
Backend: cpu | versão tfjs: 4.22.0
escalar  rank=0 shape=[] dtype=float32 elementos=1
vetor    rank=1 shape=[3] dtype=float32 elementos=3
matriz   rank=2 shape=[3,2] dtype=float32 elementos=6
imagens  rank=4 shape=[2,4,4,3] dtype=float32 elementos=96

matriz + [10, 100] (broadcasting):
Tensor
    [[11, 102],
     [13, 104],
     [15, 106]]

Camada densa  x·W + b = [ [ 1.100000023841858, -5.099999904632568 ] ]
Depois da ReLU        = [ [ 1.100000023841858, 0 ] ]

range(0,12).reshape([3,4]):
Tensor
    [[0, 1, 2 , 3 ],
     [4, 5, 6 , 7 ],
     [8, 9, 10, 11]]
Derivada de x²+3x em x=2: 7

Média de 100k amostras N(0,1): 0.001
Tensores vivos: antes=16 depois=17 (tidy liberou os intermediários)
```

Repare em `1.100000023841858`: tensores usam `float32`, não o `float64` do `number` do JS.

## Experimente

1. Troque `tf.tensor1d([10, 100])` por `tf.tensor1d([1, 2, 3])` e leia o erro de broadcasting (shapes incompatíveis).
2. Tire o `tf.tidy` e compare `tf.memory().numTensors` antes e depois: os intermediários ficam vivos (vazamento).
3. Calcule à mão `entrada · W + b` e confira com a saída: é exatamente o que uma camada `dense` faz.

## Versão Python

Em Python o "tensor" do dia a dia é o `ndarray` do **NumPy** (TensorFlow ainda não tem wheel para Python 3.14,
e o NumPy é leve e didático). Diferenças: o padrão do NumPy é `float64` (aqui forçamos `float32` para imitar o
TF.js), não há gradiente automático (a derivada é conferida numericamente; autograd de verdade: PyTorch, usado no
[módulo 09](../../../09-dados-e-fine-tuning/README.md)) e não existe `tf.tidy` (o coletor de lixo libera arrays).

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/01-tensores/python/main.py
```

**Saída esperada (Python)** — saída real:

```text
Biblioteca: NumPy 2.5.4
escalar  rank=0 shape=[] dtype=float32 elementos=1
vetor    rank=1 shape=[3] dtype=float32 elementos=3
matriz   rank=2 shape=[3, 2] dtype=float32 elementos=6
imagens  rank=4 shape=[2, 4, 4, 3] dtype=float32 elementos=96

matriz + [10, 100] (broadcasting):
[[ 11. 102.]
 [ 13. 104.]
 [ 15. 106.]]

Camada densa  x·W + b = [[1.100000023841858, -5.099999904632568]]
Depois da ReLU        = [[1.100000023841858, 0.0]]

arange(12).reshape(3, 4):
[[ 0  1  2  3]
 [ 4  5  6  7]
 [ 8  9 10 11]]
compartilha memória com o original? True
Derivada numérica de x²+3x em x=2: 7.0

Média de 100k amostras N(0,1): -0.002
Memória do array: 391 KiB (float32 = 4 bytes x 100.000)
```

O mesmo `1.100000023841858` do JS: é o `float32`, não a linguagem. A média difere do JS (`0.001`) porque o
gerador aleatório é outro, mesmo com semente 42.
