"""Dados sintéticos reprodutíveis: o MESMO gerador do JS (exemplos/02-primeira-rede-neural/dados.js).

O mulberry32 foi portado bit a bit (aritmética de 32 bits sem sinal), então a semente 7 gera exatamente
os mesmos pontos que no Node: dá para comparar as métricas das duas versões no mesmo conjunto de dados.
"""

from collections.abc import Callable

M32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """Math.imul do JS: multiplicação de inteiros de 32 bits (o resultado "dá a volta" em 2^32)."""
    return (a * b) & M32


def criar_rng(seed: int) -> Callable[[], float]:
    """PRNG mulberry32: devolve uma função que gera floats em [0, 1)."""
    a = seed & M32

    def rng() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = a
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return rng


def gerar_circulo(n: int, rng: Callable[[], float], raio: float = 0.6) -> tuple[list, list]:
    """Pontos em [-1, 1]²; rótulo 1 se estão DENTRO do círculo de raio 0,6 (não linearmente separável)."""
    xs, ys = [], []
    for _ in range(n):
        x = rng() * 2 - 1
        y = rng() * 2 - 1
        xs.append([x, y])
        ys.append(1 if x * x + y * y < raio * raio else 0)
    return xs, ys


def dividir(xs: list, ys: list, frac_treino: float = 0.7, frac_val: float = 0.15) -> dict:
    """Treino/validação/teste. Validação guia decisões; teste só é olhado no fim."""
    n = len(xs)
    a = int(n * frac_treino)
    b = int(n * (frac_treino + frac_val))
    return {
        "treino": (xs[:a], ys[:a]),
        "validacao": (xs[a:b], ys[a:b]),
        "teste": (xs[b:], ys[b:]),
    }
