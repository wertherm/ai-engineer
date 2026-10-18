"""ReAct: o modelo intercala Pensamento (reasoning trace) e Ação (tool call), observa o resultado e decide
o próximo passo. Uma chamada ao LLM por iteração: flexível, mas paga o contexto inteiro a cada volta."""

import json

from comum_py.llm import chat, js
from ferramentas import SCHEMAS_OPENAI, executar_ferramenta


def react(tarefa: str, *, max_passos: int = 8, log=print) -> dict:
    msgs: list[dict] = [
        {"role": "system", "content": 'Resolva a tarefa passo a passo. Antes de cada ação escreva "Pensamento: <uma linha>". '
                                      'Use as ferramentas para todo dado e conta. No fim responda "Resposta: <valor>".'},
        {"role": "user", "content": tarefa},
    ]
    chamadas_tool = 0
    for passo in range(1, max_passos + 1):
        r = chat(msgs, tools=SCHEMAS_OPENAI, max_tokens=150)
        msgs.append(r.msg)
        texto = (r.msg.get("content") or "").strip()
        if texto:
            log(f"  [{passo}] {' | '.join(l for l in texto.splitlines() if l.strip())} ({r.segundos:.0f}s)")
        if not r.msg.get("tool_calls"):
            return {"resposta": r.msg.get("content"), "llm_calls": passo, "chamadas_tool": chamadas_tool}
        for call in r.msg["tool_calls"]:
            args = json.loads(call["function"]["arguments"] or "{}")
            obs = executar_ferramenta(call["function"]["name"], args)
            chamadas_tool += 1
            log(f"  [{passo}] Ação: {call['function']['name']}({js(args)}) -> Observação: {js(obs)}")
            msgs.append({"role": "tool", "tool_call_id": call["id"], "content": js(obs)})
    return {"resposta": None, "llm_calls": max_passos, "chamadas_tool": chamadas_tool}
