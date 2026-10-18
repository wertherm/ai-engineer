from pathlib import Path

from checklist import auditar

PASTA = Path(__file__).resolve().parents[2] / "projeto-exemplo"


def test_projeto_exemplo_falha_exatamente_nos_itens_plantados():
    falhas = [r["id"] for r in auditar(PASTA) if r["ok"] is False]
    assert falhas == ["GOV-02", "GOV-03", "GOV-04", "GOV-05", "GOV-06"]
