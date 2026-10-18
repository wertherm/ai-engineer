"""Arredondamentos com a MESMA semântica do JavaScript, para os números baterem com a versão JS.

- round() do Python arredonda empate para o par (round(0.5) == 0); Math.round do JS arredonda para cima.
- f"{x:.1f}" também é "half-even"; Number.prototype.toFixed usa o valor exato do double e, no empate, sobe.
"""
import math
from decimal import ROUND_HALF_UP, Decimal


def js_round(x: float) -> int:
    """Equivalente a Math.round(x)."""
    return math.floor(x + 0.5)


def to_fixed(x: float, casas: int) -> str:
    """Equivalente a x.toFixed(casas): Decimal(x) é o valor exato do double, igual ao algoritmo do JS."""
    q = Decimal(1).scaleb(-casas)
    d = Decimal(x).quantize(q, rounding=ROUND_HALF_UP) if x >= 0 else -Decimal(-x).quantize(q, rounding=ROUND_HALF_UP)
    return f"{d:.{casas}f}"


def num(x: float) -> int | float:
    """Formata número como o JS imprime: 9.0 vira 9, 6.7 continua 6.7."""
    return int(x) if float(x).is_integer() else x
