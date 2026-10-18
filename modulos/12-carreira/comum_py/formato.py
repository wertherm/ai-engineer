"""Formatação de números idêntica à do JS, para as saídas Python baterem com as do Node.

- `fmt(n, d)` imita `n.toLocaleString('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d})`:
  ponto como separador de milhar, vírgula decimal, arredondamento "meio para longe do zero" sobre a
  representação decimal mais curta do float (o que o ICU faz).
- `to_fixed(n, d)` imita `Number.prototype.toFixed`: arredonda o valor binário EXATO, meio para cima.
  O `f"{x:.1f}"` do Python arredonda meio para o PAR e pode divergir em empates exatos.
- `js_str(n)` imita a conversão número -> texto do JS (`${n}`): 60.0 vira "60", 0.011 vira "0.011".
"""
from decimal import ROUND_HALF_UP, Decimal


def _arredondar(dec: Decimal, d: int) -> Decimal:
    return dec.quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)


def fmt(n: float, d: int = 0) -> str:
    q = _arredondar(Decimal(repr(float(n))), d)
    inteiro, _, frac = f"{abs(q):f}".partition(".")
    grupos = f"{int(inteiro):,}".replace(",", ".")
    sinal = "-" if q < 0 else ""
    return f"{sinal}{grupos},{frac}" if d else f"{sinal}{grupos}"


def to_fixed(n: float, d: int = 0) -> str:
    return f"{_arredondar(Decimal(float(n)), d):f}"


def js_str(n) -> str:
    if isinstance(n, float) and n.is_integer():
        return str(int(n))
    return repr(n) if isinstance(n, float) else str(n)
