"""Testes do grafo sem LLM: o nó classificar recebe um chat falso (monkeypatch)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import grafo  # noqa: E402
from comum_py.llm import Resposta  # noqa: E402


def chat_falso(saida: str):
    return lambda *a, **k: Resposta(msg={"role": "assistant", "content": saida},
                                    usage={"prompt_tokens": 50, "completion_tokens": 10, "total_tokens": 60},
                                    segundos=0.0, finish_reason="stop")


def cfg(t):
    return {"configurable": {"thread_id": t}}


def test_guardrail_de_entrada_nao_chama_llm(monkeypatch):
    monkeypatch.setattr(grafo, "chat", lambda *a, **k: (_ for _ in ()).throw(AssertionError("não devia chamar o LLM")))
    s = grafo.criar_grafo().invoke({"pedido": "Apague o banco de produção"}, cfg("c"))
    assert s["resposta"].startswith("Não executei: pedido fora do escopo")
    assert [e["no"] for e in s["auditoria"]] == ["guardrail_entrada", "fallback"]


def test_retry_resolve_e_tentativas_falhas_somem_da_auditoria(monkeypatch):
    monkeypatch.setattr(grafo, "chat", chat_falso('{"intencao":"saldo","conta":"123","destino":"","valor":0}'))
    monkeypatch.setattr(grafo, "falhas", {"restantes": 2})
    s = grafo.criar_grafo().invoke({"pedido": "Qual o saldo da conta 123?"}, cfg("a"))
    assert s["resposta"] == "Saldo da conta 123: R$ 1500"
    assert [e["no"] for e in s["auditoria"]] == ["guardrail_entrada", "classificar", "consultar_saldo"]


def test_retry_esgotado_cai_no_error_handler_e_no_fallback(monkeypatch):
    monkeypatch.setattr(grafo, "chat", chat_falso('{"intencao":"saldo","conta":"123","destino":"","valor":0}'))
    monkeypatch.setattr(grafo, "falhas", {"restantes": 5})
    s = grafo.criar_grafo().invoke({"pedido": "Qual o saldo da conta 123?"}, cfg("x"))
    assert s["resposta"] == "Não executei: API de saldo indisponível. Encaminhado para atendimento humano."
    assert [(e["no"], e["decisao"]) for e in s["auditoria"]][-2:] == [("consultar_saldo", "FALHOU"), ("fallback", "API de saldo indisponível")]


def test_orcamento_de_tokens_desvia_para_fallback(monkeypatch):
    monkeypatch.setattr(grafo, "chat", chat_falso('{"intencao":"saldo","conta":"123","destino":"","valor":0}'))
    monkeypatch.setitem(grafo.LIMITES, "orcamento_tokens", 50)
    s = grafo.criar_grafo().invoke({"pedido": "Qual o saldo da conta 123?"}, cfg("o"))
    assert "orçamento de tokens" in s["resposta"]
