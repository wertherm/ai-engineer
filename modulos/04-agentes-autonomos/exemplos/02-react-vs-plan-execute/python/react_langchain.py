"""O mesmo ReAct, agora com o framework: create_agent (LangChain v1, Python) monta um grafo LangGraph
"modelo -> tools -> modelo" por baixo. Menos código, mesmo padrão."""

import time
from typing import Literal

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_openai import ChatOpenAI

from comum_py.llm import API_KEY, BASE_URL, EXTRAS_OLLAMA, MODELO_CHAT, js
from ferramentas import FERRAMENTAS, RESPOSTA_CERTA, TAREFA, acertou

model = ChatOpenAI(
    model=MODELO_CHAT, temperature=0, max_tokens=250, api_key=API_KEY, base_url=BASE_URL,
    timeout=900, max_retries=0,
    extra_body=EXTRAS_OLLAMA,  # repassa reasoning_effort: "none" ao Ollama no corpo da requisição
)

Produto = Literal["teclado", "mouse", "monitor"]


# O schema da tool sai da assinatura (type hints) e a description, da docstring.
@tool
def consultar_estoque(produto: Produto) -> str:
    """Quantidade em estoque de um produto."""
    return js(FERRAMENTAS["consultar_estoque"]["handler"](produto))


@tool
def consultar_preco(produto: Produto) -> str:
    """Preço unitário de compra (R$) de um produto."""
    return js(FERRAMENTAS["consultar_preco"]["handler"](produto))


@tool
def calcular(expressao: str) -> str:
    """Avalia uma expressão aritmética, ex.: "(10-7)*50"."""
    return js(FERRAMENTAS["calcular"]["handler"](expressao))


def react_langchain(tarefa: str, *, log=print) -> dict:
    agent = create_agent(model, [consultar_estoque, consultar_preco, calcular],
                         system_prompt='Use as ferramentas para todo dado e conta. No fim responda só "Resposta: <valor>".')
    out = agent.invoke({"messages": [{"role": "user", "content": tarefa}]}, {"recursion_limit": 20})
    llm_calls = chamadas_tool = 0
    for m in out["messages"]:
        if m.type == "ai":
            llm_calls += 1
        if m.type == "tool":
            chamadas_tool += 1
            log(f"  tool {m.name} -> {m.content}")
    return {"resposta": out["messages"][-1].content, "llm_calls": llm_calls, "chamadas_tool": chamadas_tool}


if __name__ == "__main__":
    print(f"Tarefa: {TAREFA}\nResposta certa: {RESPOSTA_CERTA}\n\n=== ReAct (LangChain create_agent) ===")
    t0 = time.perf_counter()
    r = react_langchain(TAREFA)
    print(f"  resposta: {str(r['resposta']).strip()}")
    print(f"  estrategia=ReAct (LangChain) llm_calls={r['llm_calls']} chamadas_tool={r['chamadas_tool']} "
          f"segundos={time.perf_counter() - t0:.1f} acertou={acertou(r['resposta'])}")
