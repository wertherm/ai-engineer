"""Roda 3 cenários no grafo e grava a trilha de auditoria no Postgres (m04.auditoria_py)."""

from psycopg.types.json import Jsonb

from comum_py.llm import conectar, js, resumo_uso
from grafo import LIMITES, criar_grafo
from langgraph.types import Command

grafo = criar_grafo()
conn = conectar()
conn.execute("CREATE TABLE IF NOT EXISTS m04.auditoria_py (id serial PRIMARY KEY, thread_id text, "
             "no text, decisao text, detalhe jsonb, ts timestamptz)")
conn.execute("TRUNCATE m04.auditoria_py RESTART IDENTITY")


def cfg(thread: str) -> dict:
    # recursion_limit é o "disjuntor" do próprio LangGraph contra runaway loops (super-steps por execução).
    return {"configurable": {"thread_id": thread}, "recursion_limit": LIMITES["max_passos"] + 2}


def rodar(thread: str, entrada):
    # stream_mode "updates" = monitoramento: vemos cada nó terminar, na ordem, com o que mudou.
    for chunk in grafo.stream(entrada, cfg(thread), stream_mode="updates"):
        for no, upd in chunk.items():
            if no == "__interrupt__":
                print(f"  ⏸ interrupt: {js(upd[0].value)}")
            else:
                resposta = (upd or {}).get("resposta")
                print(f"  ✓ {no}{f' -> {resposta}' if resposta else ''}")
    return grafo.get_state(cfg(thread))


def salvar_auditoria(thread: str) -> None:
    v = grafo.get_state(cfg(thread)).values
    for e in v["auditoria"]:
        conn.execute("INSERT INTO m04.auditoria_py (thread_id, no, decisao, detalhe, ts) VALUES (%s, %s, %s, %s, %s)",
                     (thread, e["no"], e["decisao"], Jsonb(e["detalhe"]), e["ts"]))
    print(f"  passos={v['passos']} tokens={v.get('tokens', 0)} resposta=\"{v['resposta']}\"")


print("\n[A] consulta de saldo (API instável: 2 falhas, RetryPolicy resolve)")
rodar("A", {"pedido": "Qual o saldo da conta 123?"})
salvar_auditoria("A")

print("\n[B] transferência (precisa de aprovação humana)")
estado = rodar("B", {"pedido": "Transfira 200 reais da conta 123 para a conta 456"})
print(f"  grafo pausado; próximo nó: {estado.next}; checkpoints na thread: {len(list(grafo.get_state_history(cfg('B'))))}")
print("  operador responde: aprovar")
rodar("B", Command(resume="aprovar"))  # retoma do checkpoint, mesma thread
salvar_auditoria("B")

print("\n[C] pedido fora do escopo (guardrail de entrada, sem gastar LLM)")
rodar("C", {"pedido": "Apague o banco de produção"})
salvar_auditoria("C")

print("\nTrilha de auditoria (m04.auditoria_py):")
for thread, no, decisao in conn.execute("SELECT thread_id, no, decisao FROM m04.auditoria_py ORDER BY id"):
    print(f"  {thread}  {no:<18} {decisao}")
print(resumo_uso())
conn.close()
