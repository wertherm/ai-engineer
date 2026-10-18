"""Arredondamentos com a MESMA semântica do JS (o `round()` do Python arredonda empate para o par)."""
from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal


def js_round(x: float) -> int:
    """Math.round do JS: empate vai para cima (2,5 -> 3; -2,5 -> -2)."""
    return math.floor(x + 0.5)


def to_fixed(x: float, casas: int) -> str:
    """Number.prototype.toFixed: decimal EXATO do double, empate para longe do zero."""
    return str(Decimal(x).quantize(Decimal(1).scaleb(-casas), rounding=ROUND_HALF_UP))


def num_fixed(x: float, casas: int) -> float | int:
    """`+x.toFixed(n)` do JS: volta a ser número; inteiro sai sem ".0" (como o JSON do JS imprime)."""
    v = float(to_fixed(x, casas))
    return int(v) if v.is_integer() else v
