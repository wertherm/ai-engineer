"""Exemplo 06 (Python) · Human-in-the-Loop: Approval Gate por limiar de confiança + política + Audit Trail."""

import json

import psycopg
from auditoria import criar_auditoria, registrar, verificar_cadeia
from gate import avaliar, carregar_politica

from comum_py.llm import conectar, tabela

politica = carregar_politica()

# Ações que um agente de cobrança "propôs" (no mundo real: saída estruturada do LLM + score de confiança de um
# classificador calibrado ou de concordância entre modelos, não do LLM se autoavaliando).
PROPOSTAS = [
    {"id": "a1", "tipo": "reenviar_boleto", "valor": 320, "confianca": 0.97},
    {"id": "a2", "tipo": "conceder_desconto", "valor": 900, "confianca": 0.62},
    {"id": "a3", "tipo": "conceder_desconto", "valor": 12000, "confianca": 0.95},
    {"id": "a4", "tipo": "cancelar_operacao", "valor": 0, "confianca": 0.99},
    {"id": "a5", "tipo": "excluir_cliente", "valor": 0, "confianca": 0.99},
]
# Decisões do revisor humano (numa UI real, viriam de um formulário; aqui são roteirizadas).
REVISOR = {
    "a2": {"aprova": False, "nota": "cliente já teve desconto no mês"},
    "a3": {"aprova": True, "nota": "acordo da diretoria"},
    "a4": {"aprova": True, "nota": "pedido formal do cliente"},
}

with conectar() as conn:
    criar_auditoria(conn)
    linhas = []
    for acao in PROPOSTAS:
        registrar(conn, ator="agente-cobranca", evento="proposta", acao_id=acao["id"], dados=acao)
        decisao, motivo = avaliar(acao, politica)
        registrar(conn, ator="gate", evento=decisao, acao_id=acao["id"], dados={"motivo": motivo, "politica": politica["versao"]})
        final = {"automatica": "executada", "bloqueada": "bloqueada"}.get(decisao)
        if decisao == "pendente":
            r = REVISOR[acao["id"]]
            registrar(conn, ator="humano:ana", evento="aprovada" if r["aprova"] else "rejeitada", acao_id=acao["id"],
                      dados={"nota": r["nota"]})
            final = "executada" if r["aprova"] else "rejeitada"
        if final == "executada":
            registrar(conn, ator="executor", evento="executada", acao_id=acao["id"], dados={})
        linhas.append({"acao": f"{acao['id']} {acao['tipo']}", "valor": acao["valor"], "conf": acao["confianca"],
                       "gate": decisao, "motivo": motivo, "final": final})
    print(tabela(linhas))

    # Audit trail consultável: "quem decidiu o quê sobre a ação a3, e com base em qual política?"
    print("\nTrilha da ação a3:")
    for seq, _hora, ator, evento, dados in conn.execute(
            "SELECT seq, to_char(em, 'HH24:MI:SS'), ator, evento, dados::text FROM m08.auditoria_py "
            "WHERE acao_id = %s ORDER BY seq", ("a3",)):
        print(f"  #{seq} {ator:<15} {evento:<9} {dados}")

    tot = conn.execute("SELECT evento, count(*) FROM m08.auditoria_py GROUP BY evento ORDER BY evento").fetchall()
    print("\nEventos por tipo:", json.dumps(dict(tot), separators=(",", ":")))
    print("Cadeia íntegra?", "sim" if verificar_cadeia(conn) is None else "NÃO")

    # Tentativa de adulteração: o trigger barra.
    try:
        conn.execute("UPDATE m08.auditoria_py SET ator = 'ninguem' WHERE acao_id = 'a3'")
    except psycopg.errors.RaiseException as err:
        print(f"UPDATE na auditoria → erro: {err.diag.message_primary}")
    # Mesmo com o trigger desligado (quem tem permissão de DDL), a cadeia de hash denuncia.
    conn.execute("ALTER TABLE m08.auditoria_py DISABLE TRIGGER auditoria_py_imutavel")
    conn.execute("""UPDATE m08.auditoria_py SET dados = '{"nota":"aprovado por ninguém"}'
                    WHERE acao_id = 'a3' AND evento = 'aprovada'""")
    conn.execute("ALTER TABLE m08.auditoria_py ENABLE TRIGGER auditoria_py_imutavel")
    print(f"Depois de adulterar com o trigger desligado → primeira seq inválida: #{verificar_cadeia(conn)}")
