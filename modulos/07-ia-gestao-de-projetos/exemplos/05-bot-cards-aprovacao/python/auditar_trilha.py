"""Auditoria da trilha de decisões do bot: lista as linhas e recalcula a cadeia de hashes.

Uso (da pasta do módulo): uv run python exemplos/05-bot-cards-aprovacao/python/auditar_trilha.py  (exit 1 se adulterada)
"""
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))

from psycopg.rows import dict_row  # noqa: E402

from comum_py.tabela import imprimir_tabela  # noqa: E402
from trilha import TABELA, conectar, verificar_trilha  # noqa: E402

conn = conectar()
with conn.cursor(row_factory=dict_row) as cur:
    linhas = cur.execute(
        f"SELECT id, to_char(criado_em, 'HH24:MI:SS') hora, operacao->>'acao' acao, operacao->>'card' card, "
        f"status, motivo, left(hash, 10) hash FROM {TABELA} ORDER BY id"
    ).fetchall()
imprimir_tabela(linhas)
r = verificar_trilha(conn)
conn.close()
print(f"✅ cadeia íntegra ({r['total']} linhas)" if r["ok"] else f"❌ cadeia quebrada na linha {r['linha']}: alguém editou a trilha")
sys.exit(0 if r["ok"] else 1)
