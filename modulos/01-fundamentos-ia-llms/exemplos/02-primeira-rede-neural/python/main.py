"""Exemplo 02 (Python) — Primeira rede neural do zero em NumPy: dados -> treino -> validação -> inferência.

Mesmos dados (mulberry32, semente 7), mesma arquitetura (2 -> 16 ReLU -> 1 sigmoid), Adam lr=0.05,
60 épocas, lote 32, sem embaralhar. Forward, backprop e Adam estão escritos à mão em comum_py/rede.py.
"""

import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
from comum_py.dados import criar_rng, dividir, gerar_circulo
from comum_py.rede import MLP

SEED = 7

# ---------- 1. DADOS ----------
partes = dividir(*gerar_circulo(1000, criar_rng(SEED)))
tr_x, tr_y = (np.array(v, dtype=float) for v in partes["treino"])
va_x, va_y = (np.array(v, dtype=float) for v in partes["validacao"])
te_x, te_y = (np.array(v, dtype=float) for v in partes["teste"])
tr_y, va_y, te_y = (y.reshape(-1, 1) for y in (tr_y, va_y, te_y))  # shape (n, 1), como no tensor2d do JS
positivos = int(tr_y.sum())
print(f"[dados] treino={len(tr_x)} validação={len(va_x)} teste={len(te_x)}")
print(f"[dados] classe 1 (dentro do círculo) no treino: {100 * positivos / len(tr_y):.1f}%")
# Baseline: chutar sempre a classe majoritária. A rede precisa bater isso para valer algo.
baseline = max(positivos, len(tr_y) - positivos) / len(tr_y)
print(f"[dados] baseline (sempre a classe majoritária): {100 * baseline:.1f}%")

# ---------- 2. MODELO ----------
model = MLP(entradas=2, ocultas=[16], saidas=1, seeds=[1, 2])  # sementes por camada, como no JS
print(f"[modelo] parâmetros treináveis: {model.contar_parametros()} (2·16+16 + 16·1+1)")


# ---------- 3. TREINO (+ validação a cada época) ----------
def log_epoca(epoca, logs):
    if (epoca + 1) % 10 == 0 or epoca == 0:
        print(
            f"[treino] época {epoca + 1:2d} loss={logs['loss']:.4f} acc={logs['acc']:.3f}"
            f" | val_loss={logs['val_loss']:.4f} val_acc={logs['val_acc']:.3f}"
        )


inicio = time.perf_counter()
model.treinar(tr_x, tr_y, epocas=60, lr=0.05, batch=32, validacao=(va_x, va_y), ao_fim_da_epoca=log_epoca)
print(f"[treino] concluído em {time.perf_counter() - inicio:.1f}s")

# ---------- 4. AVALIAÇÃO FINAL NO TESTE (dados nunca vistos) ----------
loss_teste, acc_teste = model.avaliar(te_x, te_y)
prev = (model.prever(te_x) >= 0.5).astype(int).ravel()
real = te_y.astype(int).ravel()
vp = int(((prev == 1) & (real == 1)).sum())
fp = int(((prev == 1) & (real == 0)).sum())
fn = int(((prev == 0) & (real == 1)).sum())
vn = int(((prev == 0) & (real == 0)).sum())
print(f"[teste] loss={loss_teste:.4f} acurácia={100 * acc_teste:.1f}%")
print(f"[teste] matriz de confusão: VP={vp} FP={fp} FN={fn} VN={vn}")
print(f"[teste] precisão={vp / (vp + fp):.3f} recall={vp / (vp + fn):.3f}")

# ---------- 5. INFERÊNCIA em pontos novos ----------
novos = [[0, 0], [0.3, 0.3], [0.5, 0.5], [0.9, -0.9], [0.59, 0]]
for (x, y), p in zip(novos, model.prever(novos).ravel()):
    certa = "dentro" if x * x + y * y < 0.36 else "fora"
    print(f"[inferência] ({x}, {y}) -> P(dentro)={p:.3f} | resposta certa: {certa}")

# Salvar/carregar: np.savez("circulo.npz", *model.W, *model.b) guarda os pesos; np.load os traz de volta.
