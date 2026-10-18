"""Agent loop do zero, sem framework: percepção -> raciocínio -> ação -> feedback, até o modelo
responder sem pedir ferramenta (objetivo atingido) ou estourar o limite de passos."""

import json

from comum_py.llm import chat, js
from ferramentas import FERRAMENTAS, validar_args


def executar_agente(tarefa: str, *, max_passos: int = 5, log=print) -> dict:
    # Memory store (curto prazo): o histórico da conversa É o estado do agente.
    memoria: list[dict] = [
        {"role": "system", "content": "Você é um agente de operações. Use as ferramentas para obter dados e para toda conta; "
                                      "nunca invente números nem calcule de cabeça. Responda em português, em uma frase."},
        {"role": "user", "content": tarefa},
    ]
    toolbox = [f["schema"] for f in FERRAMENTAS.values()]

    for passo in range(1, max_passos + 1):
        # 1) PERCEPÇÃO: o que o agente "enxerga" agora = tarefa + resultados anteriores.
        log(f"\n── passo {passo} ──")
        log(f"[percepção] {len(memoria)} mensagens no contexto (última: {memoria[-1]['role']})")

        # 2) RACIOCÍNIO: o LLM decide o próximo passo (chamar tool ou responder).
        r = chat(memoria, tools=toolbox, max_tokens=150)
        memoria.append(r.msg)
        log(f"[raciocínio] {r.segundos:.1f}s, {r.usage['prompt_tokens']}+{r.usage['completion_tokens']} tokens")

        if not r.msg.get("tool_calls"):
            log(f"[fim] objetivo atingido: {r.msg.get('content')}")
            return {"resposta": r.msg.get("content"), "passos": passo}

        for call in r.msg["tool_calls"]:
            # 3) AÇÃO: o executor valida e roda o pedido do modelo.
            nome = call["function"]["name"]
            try:
                args = json.loads(call["function"]["arguments"] or "{}")
                ferramenta = FERRAMENTAS.get(nome)
                erro = validar_args(ferramenta["schema"], args) if ferramenta else f"ferramenta inexistente: {nome}"
                log(f"[ação] {nome}({js(args)})")
                resultado = {"erro": erro} if erro else ferramenta["handler"](**args)
            except Exception as e:  # erro vira feedback para o modelo, não derruba o loop
                resultado = {"erro": str(e)}
            # 4) FEEDBACK: o resultado (ou o erro!) volta ao contexto e alimenta o próximo raciocínio.
            log(f"[feedback] {js(resultado)}")
            memoria.append({"role": "tool", "tool_call_id": call["id"], "content": js(resultado)})

    log("[fim] limite de passos atingido sem resposta final")
    return {"resposta": None, "passos": max_passos}
