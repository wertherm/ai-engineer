"""Copiado do módulo 10 (exemplos/04-pii-e-mascaramento/python/pii.py): o capstone reaproveita a peça pronta.

Detecção e mascaramento de PII brasileira ANTES de mandar texto ao LLM e antes de gravar logs.

Regex sozinha gera falso positivo (todo número de 11 dígitos "parece" CPF); por isso CPF passa pelo
dígito verificador e cartão pelo algoritmo de Luhn.
Regex com re.ASCII: o \\d e o \\w do Python casam dígitos/letras Unicode; o JS (sem flag u) só ASCII.
"""
import json
import re
from datetime import UTC, datetime


def _so_digitos(s: str) -> str:
    return re.sub(r"\D", "", s, flags=re.ASCII)


def cpf_valido(valor: str) -> bool:
    """CPF válido: 11 dígitos, não todos iguais, e os 2 dígitos verificadores batem (módulo 11)."""
    d = _so_digitos(valor)
    if len(d) != 11 or len(set(d)) == 1:
        return False

    def dv(n):
        soma = sum(int(d[i]) * (n + 1 - i) for i in range(n))
        resto = soma * 10 % 11
        return 0 if resto == 10 else resto

    return dv(9) == int(d[9]) and dv(10) == int(d[10])


def luhn_valido(valor: str) -> bool:
    """Luhn: dobra dígitos alternados da direita para a esquerda; soma múltipla de 10 = número plausível."""
    d = _so_digitos(valor)
    if not 13 <= len(d) <= 19:
        return False
    soma = 0
    for i, c in enumerate(reversed(d)):
        n = int(c)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        soma += n
    return soma % 10 == 0


# Ordem importa: cartão e CPF antes de telefone, porque todos são "números com separadores".
# (?<!\d) e (?!\d) evitam casar um pedaço de um número maior.
DETECTORES = [
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", re.ASCII), None),
    ("CARTAO", re.compile(r"(?<!\d)\d{4}(?:[ -]?\d{4}){2}[ -]?\d{1,7}(?!\d)", re.ASCII), luhn_valido),
    ("CPF", re.compile(r"(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)", re.ASCII), cpf_valido),
    # +55 opcional, DDD com ou sem parênteses, 8 ou 9 dígitos (celular começa com 9)
    ("TELEFONE", re.compile(r"(?<![\d+])(?:\+?55[ -]?)?\(?\d{2}\)?[ -]?9?\d{4}[ -]?\d{4}(?!\d)", re.ASCII), None),
]
_MARCADOR = re.compile(r"\[([A-Z]+)_\d+\]")


def mascarar(texto: str) -> dict:
    """Troca cada PII por um marcador ([CPF_1], [EMAIL_1]...) e devolve o "cofre" para desfazer.

    Isso é PSEUDONIMIZAÇÃO (LGPD art. 13 §4º): reversível por quem guarda o cofre. Não é anonimização.
    """
    cofre: dict[str, str] = {}  # marcador -> valor original
    por_valor: dict[str, str] = {}  # valor original -> marcador (o mesmo CPF vira sempre o mesmo marcador)
    contagem: dict[str, int] = {}
    saida = texto
    for tipo, regex, valida in DETECTORES:
        def trocar(m, tipo=tipo, valida=valida):
            achado = m.group(0)
            if _MARCADOR.search(achado):
                return achado
            if valida and not valida(achado):
                return achado  # parece, mas não é: não mascara
            if achado in por_valor:
                return por_valor[achado]
            contagem[tipo] = contagem.get(tipo, 0) + 1
            marcador = f"[{tipo}_{contagem[tipo]}]"
            cofre[marcador] = achado
            por_valor[achado] = marcador
            return marcador

        saida = regex.sub(trocar, saida)
    return {"texto": saida, "cofre": cofre, "contagem": contagem}


def desmascarar(texto: str, cofre: dict, parciais: tuple[str, ...] = ()) -> str:
    """Recoloca os valores originais na resposta (só no backend, nunca no log).

    `parciais`: tipos que nunca voltam inteiros para a tela (mostra só os 4 últimos dígitos).
    """
    def trocar(m):
        original = cofre.get(m.group(0))
        if original is None:
            return m.group(0)
        return f"****{_so_digitos(original)[-4:]}" if m.group(1) in parciais else original

    return _MARCADOR.sub(trocar, texto)


def log_seguro(evento: str, dados: dict) -> None:
    """Logger que nunca grava PII: mascara antes de escrever (e descarta o cofre)."""
    ts = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    linha = json.dumps({"ts": ts, "evento": evento, **dados}, ensure_ascii=False, separators=(",", ":"))
    print(mascarar(linha)["texto"])
