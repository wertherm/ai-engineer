"""Testes do gerador de dados (pytest). Rodam em milissegundos, sem Ollama nem Postgres."""

import math

from comum_py.dados import criar_rng, dividir, gerar_circulo
from comum_py.rede import MLP


def test_mesma_semente_gera_os_mesmos_dados():
    assert gerar_circulo(50, criar_rng(7)) == gerar_circulo(50, criar_rng(7))


def test_rng_identico_ao_mulberry32_do_js():
    # Primeiros valores de criarRng(7) no Node (dados.js): garante dados idênticos aos do JS.
    r = criar_rng(7)
    assert [r() for _ in range(3)] == [0.011704753153026104, 0.06195825757458806, 0.97690763277933]


def test_rotulo_1_so_dentro_do_circulo():
    xs, ys = gerar_circulo(500, criar_rng(1))
    for (x, y), rotulo in zip(xs, ys):
        assert rotulo == (1 if x * x + y * y < 0.36 else 0)


def test_divisao_70_15_15():
    partes = dividir(*gerar_circulo(1000, criar_rng(2)))
    assert [len(partes[k][0]) for k in ("treino", "validacao", "teste")] == [700, 150, 150]


def test_backprop_confere_com_derivada_numerica():
    # Gradient check: o gradiente escrito à mão precisa bater com (L(w+h) - L(w-h)) / 2h.
    import numpy as np

    m = MLP(2, [4], 1, seeds=[1, 2])
    x = np.array([[0.1, -0.2], [0.5, 0.4], [-0.3, 0.8]])
    y = np.array([[1.0], [0.0], [1.0]])
    gW, _ = m._gradientes(m._forward(x), y)
    h = 1e-6
    m.W[0][0, 1] += h
    l_mais = m.loss(m.prever(x), y)
    m.W[0][0, 1] -= 2 * h
    l_menos = m.loss(m.prever(x), y)
    assert math.isclose(gW[0][0, 1], (l_mais - l_menos) / (2 * h), rel_tol=1e-4, abs_tol=1e-8)
