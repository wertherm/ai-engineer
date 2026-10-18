"""Entrada stdio do servidor CRM/billing (é o comando que Claude Desktop/VS Code executariam)."""

import sys

from comum_py.crm import criar_servidor_crm
from comum_py.db import conectar

if __name__ == "__main__":
    with conectar() as conn:  # a conexão fecha quando o client encerra o processo (fim do stdin)
        print("[crm-billing] pronto (stdio)", file=sys.stderr)
        criar_servidor_crm(conn).run()
