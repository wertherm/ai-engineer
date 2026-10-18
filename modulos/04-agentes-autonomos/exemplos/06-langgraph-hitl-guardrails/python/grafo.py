"""Grafo LangGraph (Python) de um agente bancário de brinquedo, com:
  roteamento condicional · retry (RetryPolicy) · fallback · checkpoint (InMemorySaver)
  human-in-the-loop (interrupt + Command) · guardrails (escopo, passos, orçamento, allowlist) · auditoria"""

import operator
import re
from datetime import datetime, timezone
from typing import Annotated, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.errors import NodeError
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, RetryPolicy, interrupt

from comum_py.llm import chat, extrair_json

LIMITES = {"max_passos": 8, "orcamento_tokens": 1500, "allowlist": ["consultar_saldo", "transferir"]}
BLOQUEADOS = re.compile(r"senha|apagar|drop|deletar|produção", re.IGNORECASE)  # fora do escopo do agente


class Estado(TypedDict, total=False):
    pedido: str
    intencao: str
    args: dict
    resposta: str
    # Reducers: passos e tokens SOMAM; a trilha de auditoria CONCATENA (cada nó acrescenta eventos).
    passos: Annotated[int, operator.add]
    tokens: Annotated[int, operator.add]
    auditoria: Annotated[list[dict], operator.add]


def evento(no: str, decisao: str, detalhe: dict | None = None) -> dict:
    return {"ts": datetime.now(timezone.utc).isoformat(), "no": no, "decisao": decisao, "detalhe": detalhe or {}}


class ErroTransitorio(Exception):
    """Falha que vale a pena tentar de novo (503). O RetryPolicy só reexecuta ESTE tipo (retry_on)."""


# "API" de saldo instável: falha nas 2 primeiras chamadas (erro transitório) e responde na 3ª.
CONTAS: dict[str, float] = {"123": 1500, "456": 80}
falhas = {"restantes": 2}


def api_saldo(conta: str) -> float:
    if falhas["restantes"] > 0:
        falhas["restantes"] -= 1
        print("  ↻ api_saldo: 503 (simulado); o RetryPolicy vai reexecutar o nó")
        raise ErroTransitorio("503 Service Unavailable (simulado)")
    if conta not in CONTAS:
        raise KeyError(f"conta {conta} inexistente")
    return CONTAS[conta]


def usar_ferramenta(nome: str) -> None:
    """Guardrail de ferramenta: só roda o que está na allowlist."""
    if nome not in LIMITES["allowlist"]:
        raise PermissionError(f"ferramenta fora da allowlist: {nome}")


def guardrail_entrada(s: Estado) -> dict:
    bloqueado = bool(BLOQUEADOS.search(s["pedido"]))
    # Em Python, devolver "intencao": None SOBRESCREVERIA o canal; para "não mudar nada", omita a chave.
    return {"passos": 1, **({"intencao": "bloqueado"} if bloqueado else {}),
            "auditoria": [evento("guardrail_entrada", "BLOQUEADO (fora do escopo)" if bloqueado else "ok", {"pedido": s["pedido"]})]}


def classificar(s: Estado) -> dict:
    r = chat([
        {"role": "system", "content": 'Classifique o pedido bancário. Devolva só JSON {"intencao":"saldo"|"transferencia"|"outro",'
                                      '"conta":"<origem>","destino":"<conta ou vazio>","valor":<número ou 0>}.'},
        {"role": "user", "content": s["pedido"]},
    ], max_tokens=60)
    try:
        dados = extrair_json(r.msg.get("content"))
    except ValueError:  # JSONDecodeError é subclasse de ValueError
        dados = {"intencao": "outro"}
    tokens = r.usage["total_tokens"]
    return {"passos": 1, "tokens": tokens, "intencao": dados.get("intencao", "outro"), "args": dados,
            "auditoria": [evento("classificar", f"intencao={dados.get('intencao')}", {"saida_llm": r.msg.get("content"), "tokens": tokens})]}


def consultar_saldo(s: Estado) -> dict:
    usar_ferramenta("consultar_saldo")
    saldo = api_saldo(str(s["args"]["conta"]))  # se lançar ErroTransitorio, o RetryPolicy tenta de novo
    return {"passos": 1, "resposta": f"Saldo da conta {s['args']['conta']}: R$ {saldo:g}",
            "auditoria": [evento("consultar_saldo", "ok", {"conta": s["args"]["conta"], "saldo": saldo})]}


def saldo_falhou(s: Estado, error: NodeError) -> Command:
    """error_handler (LangGraph Python 1.2): roda quando consultar_saldo esgota as tentativas (ou lança um erro não
    retentável). Em vez de derrubar a execução, AUDITA a falha e desvia para o fallback."""
    return Command(update={"passos": 1, "intencao": "erro_api",
                           "auditoria": [evento(error.node, "FALHOU", {"erro": repr(error.error)})]}, goto="fallback")


def aprovacao_humana(s: Estado) -> dict:
    # interrupt() PAUSA o grafo e salva o estado no checkpointer. Quem chamou recebe o payload em __interrupt__ e
    # retoma depois com Command(resume=...). O nó REEXECUTA DO INÍCIO na retomada: nada com efeito colateral ANTES do interrupt.
    decisao = interrupt({"pergunta": "Aprovar transferência?", **s["args"]})
    return {"passos": 1, "intencao": "transferencia_aprovada" if decisao == "aprovar" else "transferencia_negada",
            "auditoria": [evento("aprovacao_humana", decisao, {"aprovador": "operador@exemplo"})]}


def transferir(s: Estado) -> dict:
    usar_ferramenta("transferir")
    conta, destino, valor = str(s["args"]["conta"]), str(s["args"]["destino"]), float(s["args"]["valor"])
    if CONTAS[conta] < valor:
        raise ValueError("saldo insuficiente")
    CONTAS[conta] -= valor
    CONTAS[destino] = CONTAS.get(destino, 0) + valor
    return {"passos": 1, "resposta": f"Transferidos R$ {valor:g} de {conta} para {destino}.",
            "auditoria": [evento("transferir", "executado", {"conta": conta, "destino": destino, "valor": valor})]}


def fallback(s: Estado) -> dict:
    i = s.get("intencao")
    motivo = ("pedido fora do escopo" if i == "bloqueado"
              else "operador negou a transferência" if i == "transferencia_negada"
              else "API de saldo indisponível" if i == "erro_api"
              else "limite de passos" if s.get("passos", 0) >= LIMITES["max_passos"]
              else "orçamento de tokens" if s.get("tokens", 0) > LIMITES["orcamento_tokens"]
              else "não sei tratar este pedido")
    return {"passos": 1, "resposta": f"Não executei: {motivo}. Encaminhado para atendimento humano.",
            "auditoria": [evento("fallback", motivo)]}


# Roteadores: funções puras do estado -> nome do próximo nó. Guardrails de passos/orçamento entram aqui.
def excedeu_limites(s: Estado) -> bool:
    return s.get("passos", 0) >= LIMITES["max_passos"] or s.get("tokens", 0) > LIMITES["orcamento_tokens"]


def rota_entrada(s: Estado) -> str:
    return "fallback" if s.get("intencao") == "bloqueado" else "classificar"


def rota_intencao(s: Estado) -> str:
    if excedeu_limites(s):
        return "fallback"
    if s.get("intencao") == "saldo":
        return "consultar_saldo"
    try:
        valor = float(s["args"].get("valor") or 0)
    except (TypeError, ValueError):
        valor = 0
    return "aprovacao_humana" if s.get("intencao") == "transferencia" and valor > 0 else "fallback"


def rota_aprovacao(s: Estado) -> str:
    return "transferir" if s.get("intencao") == "transferencia_aprovada" else "fallback"


def criar_grafo():
    g = StateGraph(Estado)
    g.add_node("guardrail_entrada", guardrail_entrada)
    g.add_node("classificar", classificar)
    g.add_node("consultar_saldo", consultar_saldo, error_handler=saldo_falhou,
               retry_policy=RetryPolicy(max_attempts=3, initial_interval=0.2, jitter=False, retry_on=ErroTransitorio))
    g.add_node("aprovacao_humana", aprovacao_humana)
    g.add_node("transferir", transferir)
    g.add_node("fallback", fallback)
    g.add_edge(START, "guardrail_entrada")
    g.add_conditional_edges("guardrail_entrada", rota_entrada, ["classificar", "fallback"])
    g.add_conditional_edges("classificar", rota_intencao, ["consultar_saldo", "aprovacao_humana", "fallback"])
    g.add_conditional_edges("aprovacao_humana", rota_aprovacao, ["transferir", "fallback"])
    g.add_edge("consultar_saldo", END)
    g.add_edge("transferir", END)
    g.add_edge("fallback", END)
    return g.compile(checkpointer=InMemorySaver())  # checkpoint por thread_id: permite pausar/retomar


