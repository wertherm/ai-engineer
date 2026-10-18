"""Agente que CRIA, EXECUTA e AJUSTA tarefas usando três tipos de ferramenta externa:
  - banco de dados (Postgres m04.tarefas_py)       -> criar_tarefa, atualizar_tarefa
  - API REST (FastAPI local na porta 30450)        -> consultar_cotacao
  - servidor MCP (stdio, descoberto em runtime)     -> notificar_time"""

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx
from mcp import Client, StdioServerParameters, stdio_client
from psycopg.rows import dict_row

from api_rest import subir_api
from comum_py.llm import DATABASE_URL, chat, conectar, js, resumo_uso

PORTA = int(os.environ.get("PORTA_API", "30450"))
RAIZ = Path(__file__).resolve().parents[3]  # pasta do módulo: o filho importa comum_py de lá


def tabela(linhas: list[dict]) -> None:
    for l in linhas:
        print("  " + " | ".join(f"{k}={v}" for k, v in l.items()))


async def main() -> None:
    conn = conectar()
    # Tabelas _py: o JS faz DROP/CREATE de m04.tarefas/notificacoes; as duas versões não se atropelam.
    conn.execute("""
      DROP TABLE IF EXISTS m04.tarefas_py, m04.notificacoes_py;
      CREATE TABLE m04.tarefas_py (id serial PRIMARY KEY, titulo text NOT NULL, status text NOT NULL DEFAULT 'aberta',
        prioridade text NOT NULL DEFAULT 'normal', resultado text);
      CREATE TABLE m04.notificacoes_py (id serial PRIMARY KEY, time text, mensagem text, criada_em timestamptz DEFAULT now());""")
    api = subir_api(PORTA)
    params = StdioServerParameters(command=sys.executable, args=[str(Path(__file__).with_name("mcp_automacoes.py"))],
                                   env={"DATABASE_URL": DATABASE_URL, "PYTHONPATH": str(RAIZ)})

    def q(sql: str, p: tuple = ()) -> list[dict]:
        with conn.cursor(row_factory=dict_row) as cur:
            return cur.execute(sql, p).fetchall()

    # Ferramentas locais: schema JSON escrito à mão (descrições curtas e enums = menos erro do modelo).
    locais = {
        "criar_tarefa": {
            "description": "Cria uma tarefa e devolve o id.",
            "parameters": {"type": "object", "properties": {"titulo": {"type": "string"}}, "required": ["titulo"],
                           "additionalProperties": False},
            "run": lambda titulo: q("INSERT INTO m04.tarefas_py (titulo) VALUES (%s) RETURNING id, status", (titulo,))[0],
        },
        "atualizar_tarefa": {
            "description": "Ajusta prioridade, status e/ou resultado de uma tarefa.",
            "parameters": {"type": "object", "properties": {
                "id": {"type": "integer"},
                "prioridade": {"type": "string", "enum": ["baixa", "normal", "alta"]},
                "status": {"type": "string", "enum": ["aberta", "concluida"]},
                "resultado": {"type": "string"}}, "required": ["id"], "additionalProperties": False},
            "run": lambda id, prioridade=None, status=None, resultado=None: (q(
                "UPDATE m04.tarefas_py SET prioridade = COALESCE(%s, prioridade), status = COALESCE(%s, status), "
                "resultado = COALESCE(%s, resultado) WHERE id = %s RETURNING *", (prioridade, status, resultado, id))
                or [{"erro": f"tarefa {id} não existe"}])[0],
        },
        "consultar_cotacao": {
            "description": "Cotação atual de uma moeda em reais (API REST).",
            "parameters": {"type": "object", "properties": {"moeda": {"type": "string", "enum": ["USD", "EUR"]}},
                           "required": ["moeda"], "additionalProperties": False},
            "run": lambda moeda: httpx.get(f"http://127.0.0.1:{PORTA}/cotacao/{moeda}").json(),
        },
    }

    try:
        with open(os.devnull, "w") as devnull:
            async with Client(stdio_client(params, errlog=devnull)) as mcp:
                # Ferramentas do MCP: o input_schema já é JSON Schema; só reembalamos no formato da API OpenAI.
                tools_mcp = (await mcp.list_tools()).tools
                schemas = [{"type": "function", "function": {"name": n, "description": t["description"], "parameters": t["parameters"]}}
                           for n, t in locais.items()]
                schemas += [{"type": "function", "function": {"name": t.name, "description": t.description,
                             "parameters": {k: v for k, v in t.input_schema.items() if k != "$schema"}}} for t in tools_mcp]
                print("Ferramentas:", ", ".join(s["function"]["name"] for s in schemas))

                async def executar(nome: str, args: dict):
                    if nome in locais:
                        return await asyncio.to_thread(locais[nome]["run"], **args)
                    r = await mcp.call_tool(nome, args)  # roteia para o servidor MCP
                    return {"mcp": True, "isError": bool(r.is_error), "texto": "".join(getattr(c, "text", "") for c in r.content)}

                tarefa = ('Crie a tarefa "Monitorar dólar" e consulte a cotação do USD. Se passar de 5,30, '
                          "ajuste a tarefa para prioridade alta e notifique o time financeiro. "
                          "Por fim conclua a tarefa com a cotação como resultado.")
                print("Pedido:", tarefa)
                msgs = [{"role": "system", "content": "Você é um agente de operações. Execute o pedido usando as ferramentas, "
                                                      "um passo de cada vez. Responda em uma frase no fim."},
                        {"role": "user", "content": tarefa}]
                for passo in range(1, 9):
                    # A chamada do SDK openai é síncrona; to_thread não trava o loop do client MCP.
                    r = await asyncio.to_thread(chat, msgs, tools=schemas, max_tokens=150)
                    msgs.append(r.msg)
                    if not r.msg.get("tool_calls"):
                        print(f"\n[{passo}] resposta final ({r.segundos:.0f}s): {r.msg.get('content')}")
                        break
                    for call in r.msg["tool_calls"]:
                        args = json.loads(call["function"]["arguments"] or "{}")
                        try:
                            res = await executar(call["function"]["name"], args)
                        except Exception as e:  # erro de banco/HTTP vira feedback, não derruba o loop
                            res = {"erro": str(e)}
                        print(f"[{passo}] ({r.segundos:.0f}s) {call['function']['name']}({js(args)}) -> {js(res)}")
                        msgs.append({"role": "tool", "tool_call_id": call["id"], "content": js(res)})
        print("\nEstado final no banco:")
        tabela(q("SELECT id, titulo, status, prioridade, resultado FROM m04.tarefas_py"))
        tabela(q("SELECT id, time, mensagem FROM m04.notificacoes_py"))
        print(resumo_uso())
    finally:
        api.should_exit = True
        conn.close()


if __name__ == "__main__":
    asyncio.run(main())
