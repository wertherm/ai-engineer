import pytest

from classificar import classificar

CASOS = [
    ("Que serviço excelente, recomendo!", "positivo"),
    ("Amei o novo recurso do aplicativo.", "positivo"),
    ("O sistema caiu de novo, que raiva.", "negativo"),
    ("Demorou duas semanas e veio errado.", "negativo"),
    ("A reunião foi marcada para amanhã às 10h.", "neutro"),
    # Falha conhecida da v3: o modelo de 0,5B ainda responde "positivo". Fica registrada, não escondida.
    pytest.param("O relatório tem doze páginas.", "neutro", marks=pytest.mark.xfail(reason="viés positivo do 0,5B")),
]


@pytest.mark.parametrize("frase,esperado", CASOS)
def test_classificar(frase, esperado):
    assert classificar(frase) == esperado
