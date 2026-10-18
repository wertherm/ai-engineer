"""Entrega 3 (versão Python de agente-mcp.js): um agente EXTERNO usando o Micro-SaaS implantado só pelo
protocolo MCP (como faria o Claude, uma IDE ou o copiloto interno de um cliente). Não conhece o banco nem a
API REST: descobre as tools com tools/list e decide quais chamar. Padrão do módulo 03 (exemplo 03).
Pré-requisito: compose Python no ar. Rode: uv run python exemplos/03-entrega-3-front-e-implantacao/python/agente_mcp.py ["pergunta"]"""

import asyncio
import json
import os
import sys

import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from app_py.llm import criar_llm

URL_MCP = os.environ.get("URL_MCP", "http://127.0.0.1:31190/mcp")
CHAVE = os.environ.get("API_KEY", "sk-padaria-demo")
PERGUNTA = sys.argv[1] if len(sys.argv) > 1 else (
    "Vou faltar amanhã no turno da madrugada por doença: até quando aviso a gerência e o que preciso entregar depois?")


async def main() -> None:
    async with httpx2.AsyncClient(headers={"Authorization": f"Bearer {CHAVE}"}, timeout=900) as http, \
            Client(streamable_http_client(URL_MCP, http_client=http)) as mcp:
        # Só as tools de leitura RÁPIDAS: o agente já tem o próprio LLM; chamar `perguntar` (que usa o LLM do
        # servidor) dobraria custo e latência. Decisão registrada na ADR-005 (docs/04).
        tools = (await mcp.list_tools()).tools
        usadas = [t for t in tools if t.name != "perguntar"]
        openai_tools = [{"type": "function", "function": {
            "name": t.name, "description": t.description,
            "parameters": {k: v for k, v in t.input_schema.items() if k != "$schema"},  # alguns provedores recusam "$schema"
        }} for t in usadas]
        print(f"MCP em {URL_MCP} · tools descobertas: {', '.join(t.name for t in tools)}")
        print(f"tools entregues ao LLM: {', '.join(t.name for t in usadas)}\nPergunta: {PERGUNTA}")

        llm = criar_llm()
        instrucoes = mcp.instructions or ""  # = mcp.getInstructions() do SDK JS
        messages = [
            {"role": "system", "content": f"{instrucoes} Busque antes de responder. Responda em português, em até 3 frases, "
                                          "citando o arquivo entre colchetes."},
            {"role": "user", "content": PERGUNTA},
        ]
        for passo in range(1, 5):
            r = await llm.chat(messages, tools=openai_tools if passo < 4 else None, max_tokens=200)
            msg = r["msg"]
            messages.append(msg.model_dump(exclude_none=True))
            if not msg.tool_calls:
                print(f"\n[passo {passo}, {r['ms'] / 1000:.1f}s] resposta final:\n{msg.content}")
                break
            for call in msg.tool_calls:
                args = json.loads(call.function.arguments or "{}")
                print(f"\n[passo {passo}, {r['ms'] / 1000:.1f}s] agente chamou {call.function.name}"
                      f"({json.dumps(args, ensure_ascii=False, separators=(',', ':'))})")
                res = await mcp.call_tool(call.function.name, args)  # quem executa é o servidor MCP
                texto = "\n".join(getattr(c, "text", "") for c in res.content)
                print(f"  resultado{' [ERRO]' if res.is_error else ''}: {texto[:160]}...")
                messages.append({"role": "tool", "tool_call_id": call.id, "content": texto})


if __name__ == "__main__":
    asyncio.run(main())
