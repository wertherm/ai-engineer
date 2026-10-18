"""Sobe a API de verdade com uvicorn, ligada ao LLM configurado no ambiente (versão Python de server.js)."""

import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
sys.path.insert(0, str(Path(__file__).resolve().parent))
import uvicorn

from app import criar_app

PORTA = int(os.environ.get("PORTA", "30250"))
# Em produção o token vem de um cofre (Secrets Manager, Vault...). Aqui, do ambiente.
TOKEN = os.environ.get("API_TOKEN", "token-de-desenvolvimento")

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
uvicorn.run(criar_app(TOKEN), host="127.0.0.1", port=PORTA)
