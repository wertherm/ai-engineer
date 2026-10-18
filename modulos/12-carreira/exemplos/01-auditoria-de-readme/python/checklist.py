"""Checklist de README de projeto de IA (versão Python do checklist.js).

O que um recrutador ou tech lead procura nos 30 segundos em que abre o seu repositório. Cada critério é
uma função pura sobre o texto (e a lista de arquivos da pasta), para testar e reaproveitar no exercício 01.

Regex: o `re` do Python trata `\\b`, `\\w` e `\\d` como Unicode por padrão; o JS (sem a flag `u`), como
ASCII. Nos padrões abaixo isso não muda nenhum resultado (as letras acentuadas aparecem só em classes
explícitas como `[ée]`), e a auditoria compara Python x JS em todos os READMEs do repo (ver README).
"""
import re
from dataclasses import dataclass
from typing import Callable

I, M = re.IGNORECASE, re.MULTILINE


def _tem_secao(texto: str, padrao: re.Pattern) -> bool:
    return any(re.match(r"#{1,4}\s", linha) and padrao.search(linha) for linha in texto.split("\n"))


# Número seguido de unidade: a diferença entre "ficou rápido" e "p95 de 1,8 s".
METRICA = re.compile(
    r"\b\d+(?:[.,]\d+)?\s?(?:ms|s\b|min|%|tokens?|req/s|tokens/s|GB|MB|US\$|R\$|x\b)|(?:US\$|R\$)\s?\d", I
)
_PROPOSITO = re.compile(r"^#\s.+\n+(?!#)[^\n`|>-][^\n]{40,}", M)
_SECAO_RODAR = re.compile(r"como rodar|quickstart|getting started|instala|uso\b|usage", I)
_BLOCO_SHELL = re.compile(r"```(bash|sh|shell|zsh)?\n")
_SECAO_SAIDA = re.compile(r"sa[ií]da|resultado|output|exemplo de uso|demo", I)
_ARQ_TESTE = re.compile(r"(\.test\.[jt]s|_test\.py|test_.*\.py|portao\.py|casos\.ya?ml)$")


@dataclass(frozen=True)
class Criterio:
    id: str
    peso: int
    obrigatorio: bool
    descricao: str
    testar: Callable[[str, list[str]], bool]


CRITERIOS = [
    Criterio("proposito", 1, True, "Título + 1–2 frases dizendo que problema o projeto resolve",
             # Primeiro título seguido (antes do próximo título) de um parágrafo de texto corrido.
             lambda t, a: bool(_PROPOSITO.search(t))),
    Criterio("como-rodar", 2, True, 'Seção "Como rodar" com comando copiável em bloco de código',
             lambda t, a: _tem_secao(t, _SECAO_RODAR) and bool(_BLOCO_SHELL.search(t))),
    Criterio("pre-requisitos", 1, False, "Pré-requisitos explícitos (runtime, serviços, variáveis)",
             lambda t, a: bool(re.search(r"pr[ée]-requisito|requirements|prerequisite|depend[eê]ncias", t, I))),
    Criterio("saida-real", 2, True, 'Saída/resultado real colado (não só "funciona")',
             lambda t, a: _tem_secao(t, _SECAO_SAIDA) and t.count("```") >= 4),
    Criterio("metricas", 2, True,
             "Resultados medidos: pelo menos 3 números com unidade (latência, custo, acurácia, tokens)",
             lambda t, a: len(METRICA.findall(t)) >= 3),
    Criterio("diagrama", 1, False, "Diagrama de arquitetura (Mermaid ou imagem)",
             lambda t, a: bool(re.search(r"```mermaid|!\[[^\]]*\]\([^)]+\.(png|svg|gif|jpg)\)", t, I))),
    Criterio("demo", 1, False, "Demo acessível: URL, GIF/vídeo ou UI local com porta",
             lambda t, a: bool(re.search(r"\bdemo\b|https?://(localhost|127\.0\.0\.1):\d+|!\[[^\]]*\]\([^)]+\.gif\)", t, I))),
    Criterio("limitacoes", 2, True, "Limitações, trade-offs ou o que NÃO foi executado (honestidade técnica)",
             lambda t, a: bool(re.search(r"limita[çc][õo]es|trade-?offs?|armadilha|n[ãa]o executado|known issues|riscos", t, I))),
    Criterio("testes", 1, False, "Testes ou avaliação automatizada (arquivos de teste ou comando de teste no README)",
             lambda t, a: any(_ARQ_TESTE.search(x) for x in a)
             or bool(re.search(r"npm (run )?test|pytest|node --test|vitest", t, I))),
    Criterio("versoes", 1, False, "Versões fixadas das peças principais (ex.: vLLM 0.31.0)",
             lambda t, a: bool(re.search(r"\b\d+\.\d+\.\d+\b", t))),
]

PESO_TOTAL = sum(c.peso for c in CRITERIOS)


@dataclass(frozen=True)
class Resultado:
    id: str
    peso: int
    obrigatorio: bool
    descricao: str
    ok: bool


def js_round(x: float) -> int:
    """Math.round do JS: meio para cima (o round() do Python arredonda meio para o par)."""
    import math
    return math.floor(x + 0.5)


def auditar_texto(texto: str, arquivos: list[str] | None = None) -> dict:
    """Audita o texto de um README. Passa com nota >= 80% E todos os critérios obrigatórios atendidos."""
    arquivos = arquivos or []
    resultados = [Resultado(c.id, c.peso, c.obrigatorio, c.descricao, bool(c.testar(texto, arquivos))) for c in CRITERIOS]
    pontos = sum(r.peso for r in resultados if r.ok)
    nota = js_round(pontos / PESO_TOTAL * 100)
    faltando = [r.id for r in resultados if r.obrigatorio and not r.ok]
    return {"nota": nota, "passou": nota >= 80 and not faltando, "resultados": resultados, "faltando_obrigatorio": faltando}
