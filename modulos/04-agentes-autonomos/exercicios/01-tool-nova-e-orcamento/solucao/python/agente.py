"""SOLUÇÃO do exercício 01 (Python): o agent loop do exemplo 01 + (a) uma tool nova e (b) um guardrail de orçamento
(máximo de chamadas ao LLM e de tokens) checado ANTES de cada chamada."""

import json
import sys
from pathlib import Path

# Reaproveita as tools do exemplo 01 por import (pasta com hífen não é pacote: entra no sys.path).
sys.path.append(str(Path(__file__).resolve().parents[4] / "exemplos" / "01-agent-loop-do-zero" / "python"))

from comum_py.llm import chat, js  # noqa: E402
from ferramentas import FERRAMENTAS as BASE, validar_args  # noqa: E402

# (a) Tool nova: mesmo formato das outras (schema JSON + handler). Nada no loop muda.
PRECOS = {"teclado": 120, "mouse": 50, "monitor": 900}
FERRAMENTAS = {
    **BASE,
    "consultar_preco": {
        "schema": {"type": "function", "function": {
            "name": "consultar_preco",
            "description": "Preço unitário (R$) de um produto.",
            "parameters": {"type": "object", "properties": {"produto": {"type": "string", "enum": list(PRECOS)}},
                           "required": ["produto"], "additionalProperties": False}}},
        "handler": lambda produto: {"produto": produto, "preco": PRECOS[produto]},
    },
}


def executar_agente(tarefa: str, *, max_passos: int = 6, orcamento: dict | None = None, log=print) -> dict:
    orcamento = orcamento or {"chamadas": 4, "tokens": 3000}
    gasto = {"chamadas": 0, "tokens": 0}
    memoria: list[dict] = [
        {"role": "system", "content": "Você é um agente de operações. Use as ferramentas para obter dados e para toda conta; "
                                      "nunca invente números. Responda em português, em uma frase."},
        {"role": "user", "content": tarefa},
    ]
    toolbox = [f["schema"] for f in FERRAMENTAS.values()]

    for passo in range(1, max_passos + 1):
        # (b) Guardrail: checa ANTES de gastar. Depois de gasto, já era.
        if gasto["chamadas"] >= orcamento["chamadas"] or gasto["tokens"] >= orcamento["tokens"]:
            log(f"[guardrail] orçamento estourado: {js(gasto)} (limite {js(orcamento)})")
            return {"resposta": None, "motivo": "orcamento", "gasto": gasto}
        r = chat(memoria, tools=toolbox, max_tokens=150)
        gasto["chamadas"] += 1
        gasto["tokens"] += r.usage["total_tokens"]  # tokens reais do servidor, não estimativa
        memoria.append(r.msg)
        log(f"[passo {passo}] gasto até aqui: {gasto['chamadas']} chamadas, {gasto['tokens']} tokens")
        if not r.msg.get("tool_calls"):
            return {"resposta": r.msg.get("content"), "motivo": "ok", "gasto": gasto}

        for call in r.msg["tool_calls"]:
            nome = call["function"]["name"]
            try:
                args = json.loads(call["function"]["arguments"] or "{}")
                f = FERRAMENTAS.get(nome)
                erro = validar_args(f["schema"], args) if f else f"ferramenta inexistente: {nome}"
                resultado = {"erro": erro} if erro else f["handler"](**args)
                log(f"  {nome}({js(args)}) -> {js(resultado)}")
            except Exception as e:
                resultado = {"erro": str(e)}
            memoria.append({"role": "tool", "tool_call_id": call["id"], "content": js(resultado)})
    return {"resposta": None, "motivo": "max_passos", "gasto": gasto}
