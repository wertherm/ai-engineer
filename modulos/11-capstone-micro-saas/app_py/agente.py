"""Agente principal: usa o RAG como FERRAMENTA para perguntas complexas (que pedem mais de uma busca,
comparação entre políticas ou conta). Agent loop do módulo 04: percepção -> raciocínio (LLM decide)
-> ação (tool) -> feedback, com limite de passos."""

import json
import re

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "buscar_politicas",
            "description": 'Busca trechos das políticas internas da empresa. Faça uma busca por assunto (ex.: "férias", "reembolso de alimentação").',
            "parameters": {
                "type": "object",
                "properties": {"consulta": {"type": "string", "description": "assunto a buscar, curto"}},
                "required": ["consulta"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "listar_documentos",
            "description": "Lista os documentos de política disponíveis da empresa.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

_ARQUIVO_CITADO = re.compile(r"\[([\w.-]+\.md)\]", re.ASCII)


def _json(o) -> str:
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))


async def executar_agente(*, servico, llm, tenant: dict, pergunta: str, max_passos: int = 4, log=lambda _m: None) -> dict:
    """`servico` é a fachada (servico.py): o agente só enxerga o tenant recebido.
    Devolve {resposta, passos, fontes, chamadas, verificado}."""
    memoria: list[dict] = [
        {
            "role": "system",
            "content": (
                f"Você é o agente de políticas internas da empresa {tenant['nome']}. Use buscar_politicas (uma busca por assunto) "
                "antes de responder; nunca invente regras. Na resposta final, cite o arquivo de cada regra entre colchetes, "
                "ex.: [ferias.md]. Responda em português, em no máximo 4 frases."
            ),
        },
        {"role": "user", "content": pergunta},
    ]
    fontes_vistas: dict[str, None] = {}  # dict como "set ordenado" (o Set do JS preserva a ordem de inserção)
    chamadas: list[str] = []

    for passo in range(1, max_passos + 1):
        # No último passo tiramos as tools: força o modelo a responder com o que já coletou.
        tools = TOOLS if passo < max_passos else None
        r = await llm.chat(memoria, tools=tools, max_tokens=200)
        msg = r["msg"]
        # A mensagem do assistente (com tool_calls) volta ao modelo como dict.
        memoria.append(msg.model_dump(exclude_none=True))
        calls = msg.tool_calls or []
        acao = ", ".join(f"{c.function.name}({c.function.arguments})" for c in calls) if calls else "resposta final"
        log(f"[passo {passo}] {r['ms'] / 1000:.1f}s -> {acao}")

        if not calls:
            citadas = _ARQUIVO_CITADO.findall(msg.content or "")
            # Guarda: só vale citação de arquivo que o agente realmente leu nesta execução.
            verificado = bool(citadas) and all(f in fontes_vistas for f in citadas)
            return {"resposta": msg.content, "passos": passo, "fontes": list(fontes_vistas), "chamadas": chamadas,
                    "verificado": verificado}

        for call in calls:
            try:
                args = json.loads(call.function.arguments or "{}")
                if call.function.name == "buscar_politicas":
                    trechos = await servico.buscar(tenant, str(args.get("consulta") or pergunta), k=3, canal="agente")
                    for t in trechos:
                        fontes_vistas[t["fonte"]] = None
                    resultado = [{"arquivo": t["fonte"], "trecho": t["conteudo"]} for t in trechos]
                elif call.function.name == "listar_documentos":
                    resultado = await servico.listar_documentos(tenant)
                else:
                    resultado = {"erro": f"ferramenta inexistente: {call.function.name}"}
            except Exception as e:  # o erro volta ao modelo como feedback, não derruba o loop
                resultado = {"erro": str(e)}
            chamadas.append(call.function.name)
            memoria.append({"role": "tool", "tool_call_id": call.id, "content": _json(resultado)})

    return {"resposta": None, "passos": max_passos, "fontes": list(fontes_vistas), "chamadas": chamadas, "verificado": False}
