"""SOLUÇÃO do exercício 02 (Python): o mesmo agente como grafo LangGraph.
extrair -> validar -> calcular_frete (retry 3x) -> responder
                 \\-> fallback (dados inválidos)   \\-> frete_padrao (API fora do ar, via error_handler)"""

import operator
import re
import sys
from pathlib import Path
from typing import Annotated, TypedDict

from langgraph.errors import NodeError
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, RetryPolicy

sys.path.append(str(Path(__file__).resolve().parents[2] / "inicial" / "python"))

from comum_py.llm import chat, extrair_json  # noqa: E402
from linear import api_frete  # noqa: E402

FRETE_PADRAO = 50


class Estado(TypedDict, total=False):
    pedido: str
    dados: dict
    erro: str | None
    frete: int
    origem_frete: str
    resposta: str
    trilha: Annotated[list[str], operator.add]  # reducer de concatenação: cada nó acrescenta o seu nome


def criar_grafo(*, api_falhando: bool = False):
    tentativas = {"n": 0}

    def extrair(s: Estado) -> dict:
        r = chat([{"role": "system", "content": 'Extraia do pedido. Devolva só JSON {"produto":"...","quantidade":n,"cep":"somente dígitos"}.'},
                  {"role": "user", "content": s["pedido"]}], max_tokens=50)
        try:
            return {"dados": extrair_json(r.msg.get("content")), "trilha": ["extrair"]}
        except ValueError as e:
            return {"erro": str(e), "trilha": ["extrair"]}

    def validar(s: Estado) -> dict:
        """Validação determinística: não confie cegamente na saída do LLM."""
        d = s.get("dados") or {}
        cep = re.sub(r"\D", "", str(d.get("cep") or ""), flags=re.ASCII)  # \D ASCII: dígito árabe/fullwidth não passa
        q = d.get("quantidade")
        erro = s.get("erro") or ("CEP inválido" if len(cep) != 8
                                 else "quantidade inválida" if not (isinstance(q, (int, float)) and q > 0) else None)
        return {"erro": erro, "dados": {**d, "cep": cep}, "trilha": [f"validar({erro})" if erro else "validar"]}

    def calcular_frete(s: Estado) -> dict:
        # Exceção aqui aciona o RetryPolicy; esgotadas as tentativas, o error_handler assume (não derruba o grafo).
        tentativas["n"] += 1
        frete = api_frete(s["dados"]["cep"], falhar=api_falhando)
        return {"frete": frete, "origem_frete": "api", "trilha": [f"calcular_frete#{tentativas['n']}"]}

    def frete_falhou(s: Estado, error: NodeError) -> Command:
        # error_handler nativo do LangGraph Python 1.2: recebe o erro da ÚLTIMA tentativa e decide a rota.
        # (No JS não há equivalente: lá a última tentativa captura a exceção e grava `erro` no estado.)
        return Command(update={"erro": f"API de frete: {error.error}", "trilha": [f"calcular_frete#{tentativas['n']}(falhou)"]},
                       goto="frete_padrao")

    def frete_padrao(s: Estado) -> dict:
        return {"frete": FRETE_PADRAO, "origem_frete": "tabela padrão (fallback)", "trilha": ["frete_padrao"]}

    def responder(s: Estado) -> dict:
        return {"resposta": f"{s['dados']['quantidade']}x {s['dados']['produto']}, frete R$ {s['frete']} ({s['origem_frete']})",
                "trilha": ["responder"]}

    def fallback(s: Estado) -> dict:
        return {"resposta": f"Não consegui entender o pedido ({s['erro']}). Um atendente vai assumir.", "trilha": ["fallback"]}

    g = StateGraph(Estado)
    g.add_node("extrair", extrair)
    g.add_node("validar", validar)
    g.add_node("calcular_frete", calcular_frete, error_handler=frete_falhou,
               retry_policy=RetryPolicy(max_attempts=3, initial_interval=0.1, jitter=False))
    g.add_node("frete_padrao", frete_padrao)
    g.add_node("responder", responder)
    g.add_node("fallback", fallback)
    g.add_edge(START, "extrair")
    g.add_edge("extrair", "validar")
    g.add_conditional_edges("validar", lambda s: "fallback" if s.get("erro") else "calcular_frete", ["fallback", "calcular_frete"])
    g.add_edge("calcular_frete", "responder")
    g.add_edge("frete_padrao", "responder")
    g.add_edge("responder", END)
    g.add_edge("fallback", END)
    return g.compile()
