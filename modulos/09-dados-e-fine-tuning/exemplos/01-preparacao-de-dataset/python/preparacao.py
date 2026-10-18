"""Funções puras da preparação do dataset (testadas em test_preparacao.py). Espelho de `../preparacao.js`.

Cada etapa é pequena e explícita para medir o efeito de cada uma no relatório. O resultado precisa bater
BYTE A BYTE com o do JS: por isso os detalhes de regex (`re.ASCII`), arredondamento e PRNG abaixo.
"""
from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Callable

from comum_py.config import CATEGORIAS, SYSTEM_PROMPT
from comum_py.numeros import js_round, num_fixed

M32 = 0xFFFFFFFF

# ---------- 1. Limpeza e padronização de texto ----------
ENTIDADES = {"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'"}

# \w e \d do Python casam letras/dígitos Unicode ("é", "٣"); no JS são só ASCII. re.ASCII iguala os dois.
RE_ENTIDADE = re.compile(r"&[a-z#0-9]+;", re.IGNORECASE)
RE_TAG = re.compile(r"<[^>]+>")
RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+", re.ASCII)
RE_CPF = re.compile(r"\d{3}\.\d{3}\.\d{3}-\d{2}", re.ASCII)
RE_TELEFONE = re.compile(r"\(?\d{2}\)?\s?9?\d{4}-?\d{4}", re.ASCII)
RE_ESPACOS = re.compile(r"\s+")  # aqui SEM re.ASCII: o \s do JS também pega espaços Unicode (ex.: U+00A0)
RE_NAO_LETRA = re.compile(r"[^A-Za-zÀ-ÿ]")
RE_MARCADOR = re.compile(r"<(email|cpf|telefone)>")


def limpar_texto(bruto) -> str:
    t = "" if bruto is None else str(bruto)
    t = RE_ENTIDADE.sub(lambda m: ENTIDADES.get(m.group(0).lower(), " "), t)  # entidades HTML
    t = RE_TAG.sub(" ", t)  # tags HTML de e-mail
    # Dados pessoais NÃO entram no dataset: além de LGPD, o modelo pode memorizar e "vazar" depois.
    t = RE_EMAIL.sub("<EMAIL>", t)
    t = RE_CPF.sub("<CPF>", t)
    t = RE_TELEFONE.sub("<TELEFONE>", t)
    t = RE_ESPACOS.sub(" ", unicodedata.normalize("NFC", t)).strip()
    # Texto todo em CAIXA ALTA vira caixa normal (o modelo não deve associar "gritar" a uma categoria).
    letras = RE_NAO_LETRA.sub("", t)
    if len(letras) > 10 and letras == letras.upper():
        t = RE_MARCADOR.sub(lambda m: m.group(0).upper(), t.lower())
        t = t[:1].upper() + t[1:]  # NÃO use str.capitalize(): ela minúscula o resto
    return t


# ---------- 2. Padronização do rótulo ----------
def sem_acento(s: str) -> str:
    return re.sub(r"[̀-ͯ]", "", unicodedata.normalize("NFD", s))


SINONIMOS = {"financeiro": "cobranca", "login": "acesso", "logistica": "entrega",
             "produto com defeito": "defeito", "troca": "defeito", "cancelar": "cancelamento"}


def padronizar_rotulo(bruto) -> str | None:
    """Devolve a categoria canônica ou None (rótulo vazio/fora do domínio = descartar)."""
    r = sem_acento("" if bruto is None else str(bruto)).lower().strip()
    canon = SINONIMOS.get(r, r)
    return canon if canon in CATEGORIAS else None


# ---------- 3. Deduplicação (exata e quase-duplicata) ----------
def chave_normalizada(t: str) -> str:
    t = re.sub(r"[^a-z0-9<> ]", "", sem_acento(t).lower())
    return RE_ESPACOS.sub(" ", t).strip()


def jaccard(a: str, b: str) -> float:
    A, B = set(a.split(" ")), set(b.split(" "))
    inter = len(A & B)
    return inter / (len(A) + len(B) - inter)


def deduplicar(registros: list[dict], limiar: float = 0.9) -> dict:
    """Remove duplicatas exatas (após normalizar) e quase-duplicatas (Jaccard de palavras >= limiar)."""
    vistos: dict[str, dict] = {}
    mantidos: list[dict] = []
    exatas = quase = conflitos = 0
    for r in registros:
        k = chave_normalizada(r["texto"])
        if k in vistos:
            exatas += 1
            if vistos[k]["categoria"] != r["categoria"]:
                conflitos += 1  # mesmo texto, rótulos diferentes = ruído de rótulo
            continue
        # O(n²) é aceitável para centenas de linhas; com milhões use MinHash/LSH (ex.: datasketch).
        parecido = next((m for m in mantidos if jaccard(chave_normalizada(m["texto"]), k) >= limiar), None)
        if parecido is not None:
            quase += 1
            if parecido["categoria"] != r["categoria"]:
                conflitos += 1
            continue
        vistos[k] = r
        mantidos.append(r)
    return {"mantidos": mantidos, "exatas": exatas, "quase": quase, "conflitos": conflitos}


# ---------- 4. Balanceamento e split ----------
def mulberry32(seed: int) -> Callable[[], float]:
    """O MESMO PRNG do JS, bit a bit: Math.imul e `>>>` viram aritmética mascarada em 32 bits sem sinal.

    `random.Random(42)` geraria outra sequência: o split sairia diferente do JS.
    """
    estado = seed & M32

    def rand() -> float:
        nonlocal estado
        estado = (estado + 0x6D2B79F5) & M32
        t = ((estado ^ (estado >> 15)) * (estado | 1)) & M32
        t = ((t + (((t ^ (t >> 7)) * (t | 61)) & M32)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return rand


def embaralhar(arr: list, rand: Callable[[], float]) -> list:
    """Fisher-Yates com o PRNG dado (random.shuffle usaria o Mersenne Twister do Python)."""
    a = list(arr)
    for i in range(len(a) - 1, 0, -1):
        j = math.floor(rand() * (i + 1))
        a[i], a[j] = a[j], a[i]
    return a


def contar_por_categoria(regs: list[dict]) -> dict[str, int]:
    return {c: sum(1 for r in regs if r["categoria"] == c) for c in CATEGORIAS}


def balancear(registros: list[dict], rand, fator: float = 1.5) -> list[dict]:
    """Undersampling: cada classe fica com no máximo `fator` × o tamanho da menor classe."""
    teto = math.ceil(min(contar_por_categoria(registros).values()) * fator)
    return [r for c in CATEGORIAS for r in embaralhar([x for x in registros if x["categoria"] == c], rand)[:teto]]


def split_estratificado(registros: list[dict], rand, frac_validacao: float = 0.2) -> tuple[list, list]:
    """Split estratificado: mantém a proporção de cada categoria no treino e na validação."""
    treino, validacao = [], []
    for c in CATEGORIAS:
        grupo = embaralhar([r for r in registros if r["categoria"] == c], rand)
        n_val = max(1, js_round(len(grupo) * frac_validacao))  # Math.round, não round() (empate p/ o par)
        validacao += grupo[:n_val]
        treino += grupo[n_val:]
    return embaralhar(treino, rand), embaralhar(validacao, rand)


# ---------- 5. Formato chat das APIs de fine-tuning (uma conversa por linha) ----------
def para_chat_jsonl(r: dict) -> dict:
    return {"messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": r["texto"]},
        {"role": "assistant", "content": r["categoria"]},
    ]}


# ---------- 6. Métricas de qualidade e diversidade ----------
def diversidade(textos: list[str]) -> dict:
    palavras = [p for t in textos for p in chave_normalizada(t).split(" ") if p]
    bigramas = [palavras[i] + " " + palavras[i + 1] for i in range(len(palavras) - 1)]
    return {
        # type-token ratio: vocabulário distinto / total (baixo = textos repetitivos)
        "ttr": num_fixed(len(set(palavras)) / len(palavras), 3),
        "distinct2": num_fixed(len(set(bigramas)) / len(bigramas), 3),
        "mediaPalavras": num_fixed(len(palavras) / len(textos), 1),
    }
