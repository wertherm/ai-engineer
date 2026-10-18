"""Bot de cards: pedido em linguagem natural -> plano de operações (LLM) -> política (código) -> API -> trilha.

Uso (da pasta do módulo, com o mock no ar): uv run python exemplos/05-bot-cards-aprovacao/python/bot.py "pedido" [--aprovador=nome]
"""
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import Field, create_model

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo, para importar comum_py

import trello  # noqa: E402
from comum_py.llm import extrair_json  # noqa: E402
from politica import lembretes, mensagem_slack, precisa_aprovacao  # noqa: E402
from trilha import conectar, preparar_trilha, registrar, verificar_trilha  # noqa: E402

BOARD = os.environ.get("TRELLO_BOARD", "b1")
args = [a for a in sys.argv[1:] if not a.startswith("--aprovador=")]
pedido = args[0] if args else 'Crie um card "Aviso por e-mail" no Backlog com prioridade média e mova a Regra dos 60 dias para Feito'
aprovador = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--aprovador=")), None)
solicitante = os.environ.get("USER", "desconhecido")

listas, etiquetas, cards = trello.listas(BOARD), trello.etiquetas(BOARD), trello.cards(BOARD)

# Schema gerado do estado do board: o LLM só consegue citar listas que existem.
Operacao = create_model(
    "Operacao",
    acao=(Literal["criar", "mover", "priorizar", "arquivar"], ...),
    card=(str, Field(description="título do card novo (criar) ou exatamente o título de um card existente")),
    lista=(Literal[tuple(l["name"] for l in listas)], Field(description="lista de destino (criar/mover); senão repita a atual")),
    prioridade=(Literal["alta", "media", "baixa", "manter"], ...),
)
Plano = create_model("Plano", operacoes=(list[Operacao], ...))

nome_lista = {l["id"]: l["name"] for l in listas}
estado = "\n".join(f'- "{c["name"]}" em {nome_lista[c["idList"]]}' for c in cards)
plano = extrair_json(
    Plano,
    system=f"""Você traduz pedidos em operações de um quadro Trello. Uma operação por verbo do pedido.
Verbos: criar/adicionar -> criar; mover/levar/concluir -> mover; priorizar/urgente -> priorizar;
arquivar/remover/excluir -> arquivar. Use a lista exatamente como o pedido diz.
prioridade: a citada no pedido (média = media); se o pedido não cita, "manter".
Exemplo: "arquive X" -> {{"acao":"arquivar","card":"X","lista":<lista atual de X>,"prioridade":"manter"}}.
Cards existentes:\n{estado}""",
    user=pedido,
    max_tokens=300,
).model_dump()
print(f"Pedido: {pedido}\nPlano do LLM:")
for op in plano["operacoes"]:
    print("  ", op)

conn = conectar()
preparar_trilha(conn)
id_lista = {l["name"]: l["id"] for l in listas}
id_etiqueta = {e["name"]: e["id"] for e in etiquetas}

for op in plano["operacoes"]:
    existente = next((c for c in cards if c["name"].lower() == op["card"].lower()), None)
    registro = {"solicitante": solicitante, "pedido": pedido, "operacao": op}
    try:
        if op["acao"] != "criar" and not existente:
            raise LookupError(f'card "{op["card"]}" não existe')
        motivo = precisa_aprovacao(op)
        if motivo and not aprovador:
            registrar(conn, {**registro, "status": "aguardando_aprovacao", "motivo": motivo})
            print(f'⏸  {op["acao"]} "{op["card"]}": aguardando aprovação ({motivo})')
            continue
        if op["acao"] == "criar":
            dados = {"idList": id_lista[op["lista"]], "name": op["card"]}
            if op["prioridade"] != "manter":
                dados["idLabels"] = [id_etiqueta[op["prioridade"]]]
            novo = trello.criar_card(dados)
            print(f'✅ criado {novo["id"]} "{novo["name"]}"')
        elif op["acao"] == "mover":
            trello.atualizar_card(existente["id"], {"idList": id_lista[op["lista"]]})
            print(f'✅ movido "{existente["name"]}" → {op["lista"]}')
        elif op["acao"] == "priorizar":
            trello.atualizar_card(existente["id"], {"idLabels": [id_etiqueta[op["prioridade"]]]})
            print(f'✅ "{existente["name"]}" agora com prioridade {op["prioridade"]}')
        elif op["acao"] == "arquivar":
            trello.atualizar_card(existente["id"], {"closed": True})
            print(f'✅ arquivado "{existente["name"]}"')
        registrar(conn, {**registro, "status": "aprovado_e_executado" if motivo else "executado",
                         "motivo": f"aprovado por {aprovador}" if motivo else None})
    except Exception as e:  # noqa: BLE001 — qualquer falha vira linha "erro" na trilha
        registrar(conn, {**registro, "status": "erro", "motivo": str(e)})
        print(f'❌ {op["acao"]} "{op["card"]}": {e}')

# Regras de lembrete rodam sobre o estado ATUAL do board (depois das operações).
avisos = lembretes(trello.cards(BOARD), listas, datetime(2026, 11, 2, 12, tzinfo=UTC))
if avisos:
    print("\nSlack (não enviado):", json.dumps(mensagem_slack("#portal-boletos", avisos), ensure_ascii=False, separators=(",", ":")))

print("\nTrilha íntegra?", verificar_trilha(conn))
conn.close()
