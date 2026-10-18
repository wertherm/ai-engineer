"""Fluxo completo: mensagem do cliente -> mascarar -> LLM só vê marcadores -> desmascarar a resposta.

Uso: uv run python exemplos/04-pii-e-mascaramento/python/demo.py [--sem-llm]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo (comum_py)

from pii import desmascarar, log_seguro, mascarar  # noqa: E402

# Dados de TESTE (CPF e cartão gerados para passar nas validações; não pertencem a ninguém).
mensagem = ("Oi, sou a Ana (CPF 529.982.247-25). Meu cartão 4111 1111 1111 1111 foi cobrado 2x. "
            "Me responda em ana.souza@exemplo.com.br ou (11) 98765-4321. Protocolo 2024-000123.")

r = mascarar(mensagem)
print("Original (fica só no backend):\n ", mensagem)
print("\nO que vai para o LLM:\n ", r["texto"])
print("\nPII encontrada:", r["contagem"])

# O log de auditoria também passa pelo mascaramento (mesmo se alguém logar o texto cru por engano).
print("\nLog seguro:")
log_seguro("mensagem_recebida", {"canal": "chat", "texto": mensagem})

if "--sem-llm" in sys.argv:
    sys.exit(0)

from comum_py.formato import to_fixed  # noqa: E402
from comum_py.llm import MODELO_CHAT, chat  # noqa: E402

print(f"\nChamando {MODELO_CHAT} (pode levar alguns minutos)...")
resp = chat(
    [
        {"role": "system", "content":
            "Você é do suporte. Os dados pessoais vêm como marcadores [TIPO_N]. "
            "Copie os marcadores exatamente como estão, nunca invente valores. Responda em 2 frases."},
        {"role": "user", "content": r["texto"]},
    ],
    max_tokens=90,
)
print(f"\nResposta do LLM ({to_fixed(resp['ms'] / 1000)} s), ainda mascarada:\n ", resp["texto"].strip())
# Cartão e CPF não voltam inteiros nem para o próprio cliente: só os 4 últimos dígitos.
print("\nResposta desmascarada (o que o cliente recebe):\n ",
      desmascarar(resp["texto"], r["cofre"], parciais=("CARTAO", "CPF")).strip())
