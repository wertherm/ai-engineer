"""Exemplo 01 (Python) — Tensores com NumPy: o ndarray é o "tensor" do ecossistema Python.

Mesmos passos do main.js: rank/shape/dtype, broadcasting, camada densa x·W + b, reshape,
derivada (aqui numérica, porque NumPy não tem autograd) e memória/views.
"""

import numpy as np

print("Biblioteca: NumPy", np.__version__)

# 1) Rank (número de eixos = ndim) e shape. float32 para imitar o TF.js (o padrão do NumPy é float64).
escalar = np.array(3.5, dtype=np.float32)  # rank 0
vetor = np.array([1, 2, 3], dtype=np.float32)  # rank 1, shape (3,)
matriz = np.array([[1, 2], [3, 4], [5, 6]], dtype=np.float32)  # rank 2, shape (3, 2)
imagens = np.zeros((2, 4, 4, 3), dtype=np.float32)  # lote de 2 imagens 4x4 RGB: [batch, altura, largura, canais]
for nome, t in {"escalar": escalar, "vetor": vetor, "matriz": matriz, "imagens": imagens}.items():
    print(f"{nome:<8} rank={t.ndim} shape={list(t.shape)} dtype={t.dtype} elementos={t.size}")

# 2) Broadcasting: somar um vetor (2,) a uma matriz (3, 2) "estica" o vetor nas 3 linhas.
print("\nmatriz + [10, 100] (broadcasting):")
print(matriz + np.array([10, 100], dtype=np.float32))

# 3) Produto de matrizes = o coração de uma camada densa: saída = entrada · W + b
entrada = np.array([[1, 0, 2]], dtype=np.float32)  # 1 exemplo com 3 features
W = np.array([[0.5, -1], [1, 1], [0.25, -2]], dtype=np.float32)  # pesos 3 -> 2 neurônios
b = np.array([0.1, -0.1], dtype=np.float32)
camada = entrada @ W + b
print("\nCamada densa  x·W + b =", camada.tolist())
print("Depois da ReLU        =", np.maximum(camada, 0).tolist())

# 4) Reshape devolve uma VIEW: mesmos dados, outra "forma" (não copia).
seq = np.arange(12)
visao = seq.reshape(3, 4)
print("\narange(12).reshape(3, 4):")
print(visao)
print("compartilha memória com o original?", np.shares_memory(seq, visao))

# 5) Derivada: TF.js/PyTorch calculam gradiente automático (autograd). NumPy não tem autograd,
# então conferimos pela diferença central: f'(x) ≈ (f(x+h) - f(x-h)) / 2h.
# f(x) = x² + 3x  ->  f'(x) = 2x + 3  ->  f'(2) = 7. No exemplo 02 a derivada da rede é escrita à mão.
def f(x):
    return x**2 + 3 * x


h = 1e-5
print("Derivada numérica de x²+3x em x=2:", round((f(2 + h) - f(2 - h)) / (2 * h), 6))

# 6) Memória: em Python o coletor de lixo libera arrays sem referência (não existe tf.tidy).
# Semente fixa => mesma média em toda execução (o gerador é outro, então o número difere do JS).
amostras = np.random.default_rng(42).standard_normal((1000, 100), dtype=np.float32)
print(f"\nMédia de 100k amostras N(0,1): {amostras.mean():.3f}")
print(f"Memória do array: {amostras.nbytes / 1024:.0f} KiB (float32 = 4 bytes x 100.000)")
