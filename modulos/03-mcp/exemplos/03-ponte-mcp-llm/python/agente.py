"""Ponte MCP -> LLM: o client MCP descobre as tools, converte para o formato de tools da API OpenAI
(Chat Completions) e deixa o modelo decidir quais chamar, num loop de tool calling.

Funciona com Ollama (padrão) ou qualquer API compatível (OpenAI, OpenRouter) via variáveis de ambiente.
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from mcp import Client, StdioServerParameters, stdio_client
from mcp.types import Tool

from comum_py.db import DATABASE_URL, conectar, resetar_banco
from comum_py.llm import MODELO_CHAT, client as openai

SERVIDOR_CRM = Path(__file__).resolve().parents[2] / "02-empresa-como-mcp" / "python" / "server.py"
PARAMS = StdioServerParameters(command=sys.executable, args=[str(SERVIDOR_CRM)], env={"DATABASE_URL": DATABASE_URL})
PERGUNTA = sys.argv[1] if len(sys.argv) > 1 else "Quanto a Padaria Pão Quente deve no total em faturas abertas?"


def mcp_para_openai(tools: list[Tool]) -> list[dict]:
    """O input_schema do MCP já é JSON Schema: é só reembalar (sem "$schema", que alguns provedores recusam)."""
    convertidas = []
    for t in tools:
        parametros = {k: v for k, v in t.input_schema.items() if k != "$schema"}
        convertidas.append({"type": "function", "function": {"name": t.name, "description": t.description,
                                                            "parameters": parametros}})
    return convertidas


async def main() -> None:
    with conectar() as conn:
        resetar_banco(conn)

    with open(os.devnull, "w") as devnull:
        async with Client(stdio_client(PARAMS, errlog=devnull)) as mcp:
            tools = mcp_para_openai((await mcp.list_tools()).tools)
            print("Tools enviadas ao modelo:", ", ".join(t["function"]["name"] for t in tools))
            print("Pergunta:", PERGUNTA)

            messages: list[dict] = [
                {"role": "system", "content": f"{mcp.instructions} Responda em português, em uma frase, usando só dados das tools."},
                {"role": "user", "content": PERGUNTA},
            ]
            for passo in range(1, 7):
                t0 = time.perf_counter()
                # A chamada do SDK openai é síncrona; to_thread não trava o loop do client MCP.
                resp = await asyncio.to_thread(
                    openai.chat.completions.create,
                    model=MODELO_CHAT, messages=messages, tools=tools,
                    temperature=0, max_tokens=300,
                    reasoning_effort="none",  # desliga o "thinking" do qwen3.5 no Ollama (bem mais rápido em CPU)
                )
                msg = resp.choices[0].message
                messages.append(msg.model_dump(exclude_none=True))
                segundos = time.perf_counter() - t0

                if not msg.tool_calls:
                    print(f"\n[passo {passo}, {segundos:.1f}s] Resposta final: {msg.content}")
                    break
                for call in msg.tool_calls:
                    args = json.loads(call.function.arguments or "{}")
                    print(f"\n[passo {passo}, {segundos:.1f}s] modelo chamou {call.function.name}({json.dumps(args, ensure_ascii=False)})")
                    # Quem executa é o client MCP; o modelo só pediu.
                    r = await mcp.call_tool(call.function.name, args)
                    # O MCPServer Python põe no content o JSON INDENTADO; para o modelo, o structured_content
                    # compacto diz o mesmo com menos tokens (importa a ~5 tokens/s em CPU).
                    if r.structured_content is not None:
                        texto = json.dumps(r.structured_content, ensure_ascii=False)
                    else:
                        texto = "\n".join(getattr(c, "text", "") for c in r.content)
                    print(f"  resultado{' [ERRO]' if r.is_error else ''}: {texto[:200]}")
                    messages.append({"role": "tool", "tool_call_id": call.id, "content": texto})


if __name__ == "__main__":
    asyncio.run(main())
