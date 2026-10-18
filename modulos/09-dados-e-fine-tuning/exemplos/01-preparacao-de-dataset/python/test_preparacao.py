"""Testes das etapas de preparação (porta de `../preparacao.test.js`). Rode da pasta do módulo: uv run pytest"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comum_py.config import DADOS, json_js  # noqa: E402
from gerar_brutos import gerar  # noqa: E402
from preparacao import (  # noqa: E402
    balancear, deduplicar, limpar_texto, mulberry32, padronizar_rotulo, split_estratificado,
)
from preparar import preparar  # noqa: E402
from validar_jsonl import validar_arquivo  # noqa: E402


def test_limpar_texto_remove_html_mascara_pii_e_normaliza_caixa_alta():
    assert limpar_texto("<p>Oi&nbsp;tudo</p><br>") == "Oi tudo"
    assert limpar_texto("meu e-mail é ana@exemplo.com.br") == "meu e-mail é <EMAIL>"
    assert limpar_texto("CPF 123.456.789-01 tel (11) 98876-5432") == "CPF <CPF> tel <TELEFONE>"
    assert limpar_texto("   O PEDIDO NÃO CHEGOU   ") == "O pedido não chegou"


def test_padronizar_rotulo_unifica_variantes_e_descarta_fora_do_dominio():
    assert padronizar_rotulo(" Cobrança ") == "cobranca"
    assert padronizar_rotulo("Logística") == "entrega"
    assert padronizar_rotulo("elogio") is None
    assert padronizar_rotulo("") is None


def test_deduplicar_pega_exata_e_quase_duplicata_e_conta_conflito():
    regs = [
        {"texto": "Meu pedido 123 está atrasado há 5 dias.", "categoria": "entrega"},
        {"texto": " meu pedido 123 está atrasado há 5 dias ", "categoria": "cobranca"},
        {"texto": "O fone chegou quebrado.", "categoria": "defeito"},
    ]
    r = deduplicar(regs)
    assert len(r["mantidos"]) == 2
    assert r["exatas"] == 1
    assert r["conflitos"] == 1


def test_balancear_limita_cada_classe_e_split_nao_perde_exemplos():
    regs = [{"texto": f"e{i}", "categoria": "entrega"} for i in range(30)]
    regs += [{"texto": f"c{i}", "categoria": "cancelamento"} for i in range(10)]
    regs += [{"texto": f"{c}{i}", "categoria": c} for c in ("cobranca", "acesso", "defeito") for i in range(10)]
    b = balancear(regs, mulberry32(1))
    assert sum(r["categoria"] == "entrega" for r in b) == 15  # 1,5 × 10
    treino, validacao = split_estratificado(b, mulberry32(1))
    assert len(treino) + len(validacao) == len(b)
    assert sum(r["categoria"] == "cancelamento" for r in validacao) == 2


def test_validador_reprova_papel_invalido_rotulo_fora_e_poucos_exemplos(tmp_path):
    arq = tmp_path / "ruim.jsonl"
    arq.write_text("\n".join([
        json.dumps({"messages": [{"role": "usuario", "content": "oi"}, {"role": "assistant", "content": "entrega"}]}),
        json.dumps({"messages": [{"role": "user", "content": "oi"}, {"role": "assistant", "content": "elogio"}]}),
        "{quebrado",
    ]), encoding="utf-8")
    erros = validar_arquivo(arq)["erros"]
    assert any("papel inválido" in e for e in erros)
    assert any("fora do domínio" in e for e in erros)
    assert any("JSON inválido" in e for e in erros)
    assert any("mínimo 10" in e for e in erros)


# Extra da versão Python: a porta é fiel ao JS bit a bit (mesmo PRNG, mesma ordem de sorteio, mesmo JSON).
def test_mulberry32_bate_com_o_js():
    rand = mulberry32(42)
    # valores obtidos no Node: const r = mulberry32(42); [r(), r(), r()]
    assert [rand() for _ in range(3)] == [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]


def test_gerador_e_pipeline_reproduzem_os_arquivos_do_js(tmp_path):
    brutos = "".join(json_js(r) + "\n" for r in gerar())
    assert brutos == (DADOS / "tickets-brutos.jsonl").read_text(encoding="utf-8")
    (tmp_path / "tickets-brutos.jsonl").write_text(brutos, encoding="utf-8")
    relatorio, treino, validacao = preparar(tmp_path)
    assert (relatorio["entrada"], len(treino), len(validacao)) == (456, 178, 46)
    assert json_js(relatorio, indent=2) + "\n" == (DADOS / "relatorio-qualidade.json").read_text(encoding="utf-8")
