"""Solução do exercício 01 (Python) — 3 espirais entrelaçadas (multiclasse, não linear) em NumPy.

Diferenças em relação ao exemplo 02: saída softmax com 3 neurônios, rótulos one-hot, categorical
cross-entropy e comparação de arquiteturas usando SÓ a validação para escolher. Mesmos dados do JS
(mulberry32 semente 123), mesmas arquiteturas, Adam lr=0.02, 150 épocas, lote 32.
"""

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))  # raiz do módulo, para importar comum_py
from comum_py.dados import criar_rng
from comum_py.rede import MLP

CLASSES = 3


def gerar_espirais(por_classe: int, rng) -> list[tuple[list[float], int]]:
    """Espiral clássica (CS231n): cada classe é um "braço" girado 120°, com ruído."""
    pts = []
    for c in range(CLASSES):
        for i in range(por_classe):
            r = i / por_classe  # raio de 0 a 1
            theta = c * (2 * math.pi / CLASSES) + r * 4 + (rng() - 0.5) * 0.4
            pts.append(([r * math.sin(theta), r * math.cos(theta)], c))
    # Fisher-Yates com o rng semeado (igual ao JS; random.shuffle usaria outro gerador e mudaria os dados).
    for i in range(len(pts) - 1, 0, -1):
        j = math.floor(rng() * (i + 1))
        pts[i], pts[j] = pts[j], pts[i]
    return pts


pts = gerar_espirais(200, criar_rng(123))
corte1, corte2 = int(len(pts) * 0.7), int(len(pts) * 0.85)


def arrays(lista):
    x = np.array([p for p, _ in lista])
    y = np.eye(CLASSES)[[c for _, c in lista]]  # one-hot: 2 -> [0, 0, 1]
    return x, y


tr, va, te = arrays(pts[:corte1]), arrays(pts[corte1:corte2]), arrays(pts[corte2:])
print(f"treino={corte1} validação={corte2 - corte1} teste={len(pts) - corte2} | baseline (chute) ≈ 33.3%")

# Compara arquiteturas: a escolha é feita pela acurácia de VALIDAÇÃO, nunca pelo teste.
candidatos = {"sem oculta (linear)": [], "1x16": [16], "2x32": [32, 32]}
melhor = None
for nome, ocultas in candidatos.items():
    model = MLP(2, ocultas, CLASSES, seeds=[*range(1, len(ocultas) + 1), 99])
    hist = model.treinar(*tr, epocas=150, lr=0.02, batch=32, validacao=va)
    val_acc = hist[-1]["val_acc"]
    print(
        f"{nome:<20} params={model.contar_parametros():5d} "
        f"acc_treino={hist[-1]['acc']:.3f} acc_val={val_acc:.3f}"
    )
    if melhor is None or val_acc > melhor[2]:  # ">" estrito: no empate fica o mais simples
        melhor = (nome, model, val_acc)

# Só agora, com a arquitetura escolhida, olhamos o teste.
nome, model, _ = melhor
_, acc_teste = model.avaliar(*te)
print(f"\nescolhido pela validação: {nome} -> acurácia no TESTE = {100 * acc_teste:.1f}%")

# Inferência: argmax da softmax = classe prevista
novos = [[0, 0.5], [-0.5, -0.2], [0.3, -0.6]]
for ponto, p in zip(novos, model.prever(novos)):
    print(f"ponto {ponto} -> classe {p.argmax()} (probs {', '.join(f'{v:.2f}' for v in p)})")
