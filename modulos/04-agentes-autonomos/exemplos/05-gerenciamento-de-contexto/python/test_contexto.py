"""Testes das funções puras de contexto (sem LLM): uv run pytest exemplos/05-gerenciamento-de-contexto."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from contexto import costurar, estimar_tokens, janela, podar_tools_antigas  # noqa: E402


def test_estimar_tokens_soma_4_por_mensagem():
    assert estimar_tokens([{"role": "user", "content": "abcdefgh"}, {"role": "assistant", "content": ""}]) == (2 + 4) + (0 + 4)


def test_poda_so_tools_antigas():
    msgs = [{"role": "tool", "content": "x" * 100} for _ in range(3)]
    podado = podar_tools_antigas(msgs, manter_ultimas=2, max_chars=10)
    assert podado[0]["content"] == "x" * 10 + "… [podado]"
    assert podado[1:] == msgs[1:]
    assert msgs[0]["content"] == "x" * 100  # não muta a entrada


def test_janela_respeita_orcamento_e_ordem():
    msgs = [{"role": "user", "content": str(i) * 40} for i in range(5)]  # 10 + 4 = 14 tokens cada
    out = janela(msgs, 30)
    assert out == msgs[-2:]


def test_costurar_ordem_fixa():
    [sistema, ultima] = costurar(global_="G", fatos=["f"], resumo="R", local=["l"], recentes=[{"role": "user", "content": "u"}])
    assert sistema["content"] == "G\n\nFatos fixados:\n- f\n\nResumo do que já aconteceu: R\n\nContexto local desta etapa:\n- l"
    assert ultima["content"] == "u"
