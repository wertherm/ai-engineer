from pathlib import Path

from checklist import auditar_texto

AQUI = Path(__file__).resolve().parent.parent  # pasta do exemplo: os dados são os mesmos do JS


def ler(p: str) -> str:
    return (AQUI / p).read_text(encoding="utf-8")


def ok(r, id_):
    return next(c for c in r["resultados"] if c.id == id_).ok


def test_readme_fraco_nao_passa_e_acusa_os_5_obrigatorios():
    r = auditar_texto(ler("fixtures/projeto-fraco/README.md"))
    assert r["passou"] is False
    assert r["faltando_obrigatorio"] == ["proposito", "como-rodar", "saida-real", "metricas", "limitacoes"]


def test_readme_reescrito_do_exercicio_01_passa():
    r = auditar_texto(ler("../../exercicios/01-readme-que-passa/solucao/README-reescrito.md"))
    assert r["passou"] is True, f"faltando: {r['faltando_obrigatorio']}"


def test_metricas_exigem_numero_com_unidade():
    sem = auditar_texto("# x\n\nTemos 3 coisas, 4 itens e 5 casos.")
    com = auditar_texto("# x\n\np95 de 1800 ms, 92% de acerto, US$ 0,004 por pergunta.")
    assert ok(sem, "metricas") is False
    assert ok(com, "metricas") is True
